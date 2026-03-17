#!/usr/bin/env python3
"""
Phase 5: Evaluation & metric collection.

Evaluates the fine-tuned model on:
- GSM8K (target ≥94%)
- CommonsenseQA (target ≥93%)
- AQuA-RAT (target ≥92%)

Generates paper-style accuracy tables and logs to the dashboard.

Usage:
    python pipeline/05_evaluate.py [--checkpoint outputs/final_adapter] [--max-samples 200]
"""
import os
import sys
import json
import re
import logging
import argparse
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase5_evaluate.log"),
    ],
)
log = logging.getLogger(__name__)

BENCHMARK_TARGETS = {
    "gsm8k": 0.94,
    "commonsenseqa": 0.93,
    "aqua": 0.92,
}

EVAL_PROMPTS = {
    "gsm8k": "Solve the following math problem. Give only the final numeric answer.\n\nQuestion: {question}\n\nAnswer:",
    "commonsenseqa": "Answer the following multiple choice question with just the letter (A/B/C/D/E).\n\nQuestion: {question}\n\nAnswer:",
    "aqua": "Answer the following math problem with just the option letter.\n\nQuestion: {question}\n\nAnswer:",
}


def extract_answer(text: str, benchmark: str) -> str:
    """Extract predicted answer from model output."""
    text = text.strip()

    if benchmark == "gsm8k":
        numbers = re.findall(r"[\d,]+\.?\d*", text)
        if numbers:
            return numbers[0].replace(",", "")
        return text

    elif benchmark in ("commonsenseqa", "aqua"):
        m = re.match(r"^([A-Ea-e])", text)
        if m:
            return m.group(1).upper()
        m = re.search(r"\b([A-Ea-e])\b", text)
        if m:
            return m.group(1).upper()
        return text[:1].upper()

    return text


def normalize_answer(ans: str, benchmark: str) -> str:
    ans = ans.strip().upper().replace(",", "").replace("$", "")
    if benchmark == "gsm8k":
        try:
            return str(int(float(ans)))
        except (ValueError, OverflowError):
            return ans
    return ans


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


def report_metric(benchmark: str, accuracy: float, sample_count: int, step: int = None):
    """Report evaluation metric to dashboard."""
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "benchmark": benchmark,
        "accuracy": accuracy,
        "targetAccuracy": BENCHMARK_TARGETS.get(benchmark, 0.90),
        "sampleCount": sample_count,
        "checkpointStep": step,
        "evaluatedAt": datetime.utcnow().isoformat(),
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/eval-metric",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"Metric notify failed: {e}")


def evaluate_on_benchmark(model, tokenizer, dataset_name: str, max_samples: int, device: str) -> dict:
    """Run evaluation on a single benchmark."""
    import pandas as pd
    import torch

    # Map dataset names
    ds_file_map = {
        "gsm8k": "data/processed/gsm8k/test.parquet",
        "commonsenseqa": "data/processed/commonsenseqa/validation.parquet",
        "aqua": "data/processed/aqua_rat/test.parquet",
    }

    bm_map = {
        "gsm8k": "gsm8k",
        "commonsenseqa": "commonsenseqa",
        "aqua": "aqua",
    }

    ds_file = Path(ds_file_map[dataset_name])
    if not ds_file.exists():
        log.warning(f"Test file not found: {ds_file}")
        return {"benchmark": dataset_name, "accuracy": 0, "error": "no_test_data"}

    df = pd.read_parquet(ds_file)
    if max_samples:
        df = df.head(max_samples)

    benchmark = bm_map[dataset_name]
    prompt_template = EVAL_PROMPTS[benchmark]

    correct = 0
    total = len(df)
    log.info(f"  Evaluating {dataset_name}: {total} examples")

    for i, row in df.iterrows():
        question = row["question"]
        ground_truth = str(row.get("answer", ""))
        prompt = prompt_template.format(question=question)

        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512).to(device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=32,
                do_sample=False,
                temperature=1.0,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
        predicted = extract_answer(generated, benchmark)

        pred_norm = normalize_answer(predicted, benchmark)
        gt_norm = normalize_answer(ground_truth, benchmark)

        if pred_norm == gt_norm:
            correct += 1

        if (i + 1) % 50 == 0:
            running_acc = correct / (i + 1)
            log.info(f"    Progress: {i+1}/{total} | Running accuracy: {running_acc:.3f}")

    accuracy = correct / total
    return {
        "benchmark": dataset_name,
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "target": BENCHMARK_TARGETS.get(benchmark, 0.90),
    }


def main():
    parser = argparse.ArgumentParser(description="Phase 5: Evaluation")
    parser.add_argument("--checkpoint", default="outputs/final_adapter")
    parser.add_argument("--max-samples", type=int, default=200, help="Max test examples per benchmark")
    parser.add_argument("--benchmarks", nargs="+", default=["gsm8k", "commonsenseqa", "aqua"])
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 5: Evaluation")
    log.info(f"Checkpoint: {args.checkpoint}")
    log.info(f"Benchmarks: {args.benchmarks}")
    log.info(f"Max samples: {args.max_samples}")
    log.info("=" * 60)

    notify_api(5, "running", f"Loading model for evaluation...")

    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel
    except ImportError as e:
        log.error(f"Missing ML dependencies: {e}")
        sys.exit(1)

    # Load model
    checkpoint_path = Path(args.checkpoint)
    config_path = checkpoint_path / "training_config.json"

    if config_path.exists():
        config = json.loads(config_path.read_text())
        base_model = config["base_model"]
    else:
        state_path = Path("outputs/pipeline_state.json")
        if state_path.exists():
            state = json.loads(state_path.read_text())
            base_model = state.get("base_model", "meta-llama/Llama-2-7b-hf")
        else:
            base_model = "meta-llama/Llama-2-7b-hf"

    log.info(f"Base model: {base_model}")
    hf_token = os.environ.get("HF_TOKEN")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    tokenizer_kwargs = {"token": hf_token} if hf_token else {}
    tokenizer = AutoTokenizer.from_pretrained(base_model, **tokenizer_kwargs)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs = {"token": hf_token} if hf_token else {}
    if device == "cuda":
        import torch
        model_kwargs["torch_dtype"] = torch.float16
        model_kwargs["device_map"] = "auto"

    base = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)

    if checkpoint_path.exists() and (checkpoint_path / "adapter_config.json").exists():
        log.info("Loading LoRA adapter...")
        model = PeftModel.from_pretrained(base, str(checkpoint_path))
        model = model.merge_and_unload()
    else:
        log.warning("No adapter found — evaluating base model")
        model = base

    model.eval()
    log.info(f"Model loaded on {device}")

    # Run evaluations
    results = []
    for i, benchmark in enumerate(args.benchmarks):
        log.info(f"\n[{i+1}/{len(args.benchmarks)}] Evaluating {benchmark}...")
        notify_api(5, "running", f"Evaluating {benchmark}...", i / len(args.benchmarks))

        result = evaluate_on_benchmark(model, tokenizer, benchmark, args.max_samples, device)
        results.append(result)

        accuracy = result["accuracy"]
        target = result.get("target", 0.90)
        status_icon = "✓" if accuracy >= target else "✗"
        log.info(f"  {status_icon} {benchmark}: {accuracy:.3f} (target: {target:.2f})")

        # Report to dashboard
        bm_label_map = {"gsm8k": "gsm8k", "commonsenseqa": "commonsenseqa", "aqua": "aqua"}
        report_metric(bm_label_map[benchmark], accuracy, result.get("total", 0))

    # Save results
    out_dir = Path("outputs/evals")
    out_dir.mkdir(parents=True, exist_ok=True)
    eval_file = out_dir / f"eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    eval_file.write_text(json.dumps({"results": results, "evaluated_at": datetime.utcnow().isoformat()}, indent=2))

    # Print paper-style table
    log.info("\n" + "=" * 60)
    log.info("EVALUATION RESULTS (Paper-style)")
    log.info("=" * 60)
    log.info(f"{'Benchmark':<20} {'Accuracy':>10} {'Target':>8} {'Status':>8}")
    log.info("-" * 50)
    all_met = True
    for r in results:
        acc = r["accuracy"]
        target = r.get("target", 0.90)
        met = acc >= target
        all_met = all_met and met
        icon = "✓ PASS" if met else "✗ FAIL"
        log.info(f"{r['benchmark']:<20} {acc*100:>9.2f}% {target*100:>7.0f}% {icon:>8}")
    log.info("=" * 60)

    # Update state
    state_path = Path("outputs/pipeline_state.json")
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    state["phase5_completed"] = True
    state["eval_results"] = results
    state_path.write_text(json.dumps(state, indent=2))

    overall_msg = "All benchmarks met targets!" if all_met else "Some benchmarks below target — consider more training"
    notify_api(5, "completed", overall_msg, 1.0, {"results": results})

    log.info(f"\n✓ Phase 5 complete")
    log.info("Next step: python pipeline/06_deploy.py")


if __name__ == "__main__":
    main()
