#!/usr/bin/env python3
"""
Phase 4: LoRA/QLoRA fine-tuning of Llama-2-7B on the filtered CoT dataset.

Architecture:
- Base model: meta-llama/Llama-2-7b-hf (or fallback to TinyLlama for testing)
- Quantization: 4-bit QLoRA via bitsandbytes (fits in <=24GB VRAM)
- PEFT: LoRA adapters on attention layers
- Training: SFT with TRL's SFTTrainer

Resumable: continues from last checkpoint in outputs/checkpoints/

Usage:
    python pipeline/04_finetune.py [--model meta-llama/Llama-2-7b-hf] [--epochs 3] [--test-run]
"""
import os
import sys
import json
import logging
import argparse
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase4_finetune.log"),
    ],
)
log = logging.getLogger(__name__)


def notify_api(phase: int, status: str, message: str, progress: float = None, metadata: dict = None):
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": phase, "status": status, "message": message,
        "progress": progress, "metadata": metadata or {},
        "timestamp": datetime.utcnow().isoformat()
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/phase-update",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"API notify failed: {e}")


def log_training_step(step: int, loss: float, lr: float = None):
    """Log training step to dashboard."""
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "step": step, "loss": loss, "learningRate": lr,
        "timestamp": datetime.utcnow().isoformat()
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/training-step",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"Training step notify failed: {e}")


class DashboardCallback:
    """Custom trainer callback to report training progress."""

    def __init__(self, total_steps: int):
        self.total_steps = total_steps
        self.last_report = 0

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs and "loss" in logs:
            step = state.global_step
            loss = logs["loss"]
            lr = logs.get("learning_rate")

            # Report every 10 steps
            if step - self.last_report >= 10:
                log_training_step(step, loss, lr)
                progress = step / max(self.total_steps, 1)
                notify_api(4, "running", f"Step {step}/{self.total_steps} | Loss: {loss:.4f}", progress)
                self.last_report = step


def format_prompt(example: dict) -> str:
    """Format a training example into the prompt format."""
    instruction = example["instruction"]
    output = example["output"]
    cot = example.get("cot_reasoning", "")

    # DE-COT training: we include CoT in training but not at inference
    # Format: question + cot as context → answer
    if cot:
        return f"### Question:\n{instruction}\n\n### Reasoning:\n{cot}\n\n### Answer:\n{output}"
    return f"### Question:\n{instruction}\n\n### Answer:\n{output}"


def load_training_data(data_path: Path, tokenizer, max_samples: int = None):
    """Load and tokenize the filtered CoT dataset."""
    from datasets import Dataset

    records = []
    with open(data_path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    if max_samples:
        records = records[:max_samples]

    log.info(f"Loaded {len(records)} training examples")

    # Format prompts
    texts = [format_prompt(r) for r in records]
    dataset = Dataset.from_dict({"text": texts})
    return dataset


def main():
    parser = argparse.ArgumentParser(description="Phase 4: LoRA Fine-tuning")
    parser.add_argument("--model", default="meta-llama/Llama-2-7b-hf",
                        help="Base model HuggingFace path")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--grad-accum", type=int, default=4, help="Gradient accumulation steps")
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--lora-rank", type=int, default=64)
    parser.add_argument("--lora-alpha", type=int, default=128)
    parser.add_argument("--lora-dropout", type=float, default=0.1)
    parser.add_argument("--max-seq-len", type=int, default=512)
    parser.add_argument("--max-samples", type=int, default=None)
    parser.add_argument("--test-run", action="store_true", help="Quick test with 100 samples / 10 steps")
    parser.add_argument("--no-quantize", action="store_true", help="Disable 4-bit quantization (needs more VRAM)")
    parser.add_argument("--output-dir", default="outputs/checkpoints")
    args = parser.parse_args()

    if args.test_run:
        args.max_samples = 100
        args.epochs = 1
        log.info("TEST RUN MODE: 100 samples, 1 epoch")

    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 4: LoRA/QLoRA Fine-tuning")
    log.info(f"Base model: {args.model}")
    log.info(f"LoRA rank: {args.lora_rank} | alpha: {args.lora_alpha}")
    log.info(f"Epochs: {args.epochs} | Batch: {args.batch_size} | Grad accum: {args.grad_accum}")
    log.info("=" * 60)

    notify_api(4, "running", f"Loading model {args.model}...")

    try:
        import torch
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            TrainingArguments,
            TrainerCallback,
            TrainerState,
            TrainerControl,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training
        from trl import SFTTrainer, SFTConfig
    except ImportError as e:
        log.error(f"Missing ML dependencies: {e}. Run Phase 0 first.")
        sys.exit(1)

    # Check data
    data_path = Path("outputs/cot_filtered/train.jsonl")
    if not data_path.exists():
        log.error("Filtered training data not found. Run Phase 3 first.")
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Look for existing checkpoint to resume
    checkpoints = sorted(out_dir.glob("checkpoint-*"))
    resume_from = str(checkpoints[-1]) if checkpoints else None
    if resume_from:
        log.info(f"Resuming from checkpoint: {resume_from}")

    # GPU check
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        log.warning("⚠ No GPU detected — training will be extremely slow")
        notify_api(4, "running", "Warning: training on CPU (no GPU detected)")

    # BitsAndBytes config for 4-bit QLoRA
    bnb_config = None
    if device == "cuda" and not args.no_quantize:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )
        log.info("✓ Using 4-bit QLoRA quantization")

    # Load tokenizer
    log.info("Loading tokenizer...")
    hf_token = os.environ.get("HF_TOKEN")
    tokenizer_kwargs = {"token": hf_token} if hf_token else {}

    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model, **tokenizer_kwargs)
    except Exception as e:
        log.error(f"Failed to load tokenizer for {args.model}: {e}")
        log.info("Trying fallback model: TinyLlama/TinyLlama-1.1B-Chat-v1.0")
        args.model = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
        tokenizer = AutoTokenizer.from_pretrained(args.model)

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # Load model
    log.info(f"Loading model {args.model}...")
    model_kwargs = {"token": hf_token} if hf_token else {}
    if bnb_config:
        model_kwargs["quantization_config"] = bnb_config
        model_kwargs["device_map"] = "auto"
    else:
        model_kwargs["torch_dtype"] = torch.float16 if device == "cuda" else torch.float32
        if device == "cuda":
            model_kwargs["device_map"] = "auto"

    model = AutoModelForCausalLM.from_pretrained(args.model, **model_kwargs)

    if bnb_config:
        model = prepare_model_for_kbit_training(model)

    # LoRA config
    lora_config = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Load dataset
    dataset = load_training_data(data_path, tokenizer, args.max_samples)
    total_steps = (len(dataset) // (args.batch_size * args.grad_accum)) * args.epochs

    log.info(f"Training examples: {len(dataset)} | Total steps: {total_steps}")
    notify_api(4, "running", f"Starting training: {len(dataset)} examples, {total_steps} steps")

    # Custom callback for dashboard reporting
    class TrainingReportCallback(TrainerCallback):
        def __init__(self):
            self.last_report_step = 0

        def on_log(self, args, state, control, logs=None, **kwargs):
            if logs and "loss" in logs:
                step = state.global_step
                if step - self.last_report_step >= 10:
                    log_training_step(step, logs["loss"], logs.get("learning_rate"))
                    progress = step / max(total_steps, 1)
                    notify_api(4, "running", f"Step {step} | Loss: {logs['loss']:.4f}", progress,
                               {"step": step, "loss": logs["loss"], "lr": logs.get("learning_rate")})
                    self.last_report_step = step

    # Training arguments
    sft_config = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=10,
        save_steps=100,
        save_total_limit=3,
        fp16=device == "cuda" and not bnb_config,
        bf16=device == "cuda" and bool(bnb_config),
        max_seq_length=args.max_seq_len,
        dataset_text_field="text",
        report_to="none",
        dataloader_num_workers=0,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset,
        tokenizer=tokenizer,
        callbacks=[TrainingReportCallback()],
    )

    # Train (with resume support)
    log.info("Starting training...")
    trainer.train(resume_from_checkpoint=resume_from)

    # Save final adapter
    adapter_path = Path("outputs/final_adapter")
    adapter_path.mkdir(parents=True, exist_ok=True)
    trainer.model.save_pretrained(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))

    # Save training config
    config = {
        "base_model": args.model,
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "epochs": args.epochs,
        "total_steps": total_steps,
        "training_examples": len(dataset),
        "adapter_path": str(adapter_path),
        "completed_at": datetime.utcnow().isoformat(),
    }
    (adapter_path / "training_config.json").write_text(json.dumps(config, indent=2))

    # Update state
    state_path = Path("outputs/pipeline_state.json")
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    state.update({"phase4_completed": True, "adapter_path": str(adapter_path), "base_model": args.model})
    state_path.write_text(json.dumps(state, indent=2))

    notify_api(4, "completed", f"Training complete! Adapter saved to {adapter_path}", 1.0,
               {"adapter_path": str(adapter_path), "base_model": args.model})

    log.info(f"\n✓ Phase 4 complete — adapter saved to {adapter_path}")
    log.info("Next step: python pipeline/05_evaluate.py")


if __name__ == "__main__":
    main()
