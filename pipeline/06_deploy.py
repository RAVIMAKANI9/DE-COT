#!/usr/bin/env python3
"""
Phase 6: Merge adapter and deploy as FastAPI inference service.

Starts a FastAPI server on port 8000 that:
- Loads the merged LoRA adapter
- Answers reasoning questions with no explicit CoT at runtime (internalized)
- Targets 0.6–0.9s latency per question on GPU
- Falls back to GPT-4o-mini if model not loaded

Usage:
    python pipeline/06_deploy.py [--port 8000] [--checkpoint outputs/final_adapter]
"""
import os
import sys
import json
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase6_deploy.log"),
    ],
)
log = logging.getLogger(__name__)

# Global model state
model_state = {
    "model": None,
    "tokenizer": None,
    "device": "cpu",
    "adapter_path": None,
    "base_model": None,
    "loaded": False,
}


def load_model(checkpoint_path: str):
    """Load the fine-tuned model for inference."""
    global model_state

    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel

        ckpt = Path(checkpoint_path)
        config_path = ckpt / "training_config.json"

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

        device = "cuda" if torch.cuda.is_available() else "cpu"
        hf_token = os.environ.get("HF_TOKEN")
        tokenizer_kwargs = {"token": hf_token} if hf_token else {}

        log.info(f"Loading tokenizer from {base_model}...")
        tokenizer = AutoTokenizer.from_pretrained(base_model, **tokenizer_kwargs)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model_kwargs = {"token": hf_token} if hf_token else {}
        if device == "cuda":
            model_kwargs["torch_dtype"] = torch.float16
            model_kwargs["device_map"] = "auto"

        log.info(f"Loading base model {base_model}...")
        base = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)

        if ckpt.exists() and (ckpt / "adapter_config.json").exists():
            log.info("Loading LoRA adapter and merging...")
            model = PeftModel.from_pretrained(base, str(ckpt))
            model = model.merge_and_unload()
            log.info("✓ Adapter merged successfully")
        else:
            log.warning("No adapter found — serving base model only")
            model = base

        model.eval()

        model_state.update({
            "model": model,
            "tokenizer": tokenizer,
            "device": device,
            "adapter_path": str(ckpt),
            "base_model": base_model,
            "loaded": True,
        })
        log.info(f"✓ Model ready on {device}")
        return True

    except Exception as e:
        log.error(f"Failed to load model: {e}")
        return False


def generate_answer(question: str, benchmark: str = None) -> dict:
    """Run inference on a question. Returns answer and latency."""
    if not model_state["loaded"]:
        # Fallback to GPT-4o-mini if model not loaded
        return generate_fallback(question, benchmark)

    import torch

    prompt_templates = {
        "gsm8k": f"Solve this math problem. Answer with just the number.\n\nQuestion: {question}\n\nAnswer:",
        "commonsenseqa": f"Answer with just the letter (A/B/C/D/E).\n\nQuestion: {question}\n\nAnswer:",
        "aqua": f"Answer with just the option letter.\n\nQuestion: {question}\n\nAnswer:",
    }

    prompt = prompt_templates.get(benchmark, f"Answer the following question concisely.\n\nQuestion: {question}\n\nAnswer:")

    tokenizer = model_state["tokenizer"]
    model = model_state["model"]
    device = model_state["device"]

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512).to(device)

    t0 = time.time()
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=64,
            do_sample=False,
            temperature=1.0,
            pad_token_id=tokenizer.eos_token_id,
        )
    latency_ms = (time.time() - t0) * 1000

    answer = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()

    return {
        "answer": answer,
        "latencyMs": latency_ms,
        "modelLoaded": True,
        "usedFallback": False,
    }


def generate_fallback(question: str, benchmark: str = None) -> dict:
    """Fallback to OpenAI GPT if model not loaded."""
    t0 = time.time()
    try:
        import openai
        client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        prompt = f"Answer this question concisely. Give only the final answer.\n\nQuestion: {question}\n\nAnswer:"
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=64,
            temperature=0,
        )
        answer = response.choices[0].message.content.strip()
    except Exception as e:
        answer = f"[Error: {e}]"

    latency_ms = (time.time() - t0) * 1000
    return {
        "answer": answer,
        "latencyMs": latency_ms,
        "modelLoaded": False,
        "usedFallback": True,
    }


def create_fastapi_app():
    """Create and configure the FastAPI app."""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from typing import Optional

    app = FastAPI(
        title="DE-COT Inference Service",
        description="Reasoning inference endpoint for the DE-COT distilled model",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class QueryRequest(BaseModel):
        question: str
        benchmark: Optional[str] = None

    class QueryResponse(BaseModel):
        answer: str
        latencyMs: float
        modelLoaded: bool
        usedFallback: bool

    @app.get("/health")
    def health():
        return {"status": "ok", "modelLoaded": model_state["loaded"]}

    @app.get("/status")
    def status():
        return {
            "modelLoaded": model_state["loaded"],
            "adapterPath": model_state["adapter_path"],
            "baseModel": model_state["base_model"],
            "deviceMap": model_state["device"],
            "readyForInference": True,
        }

    @app.post("/query")
    def query(request: QueryRequest) -> QueryResponse:
        if not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        result = generate_answer(request.question, request.benchmark)
        return QueryResponse(**result)

    return app


def main():
    parser = argparse.ArgumentParser(description="Phase 6: Deploy inference server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--checkpoint", default="outputs/final_adapter")
    parser.add_argument("--no-model-load", action="store_true", help="Start server without loading model (fallback mode)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 6: Deploy Inference Server")
    log.info(f"Port: {args.port} | Checkpoint: {args.checkpoint}")
    log.info("=" * 60)

    if not args.no_model_load:
        log.info("Loading model for inference...")
        success = load_model(args.checkpoint)
        if not success:
            log.warning("Model load failed — server will use fallback mode (GPT-4o-mini)")
    else:
        log.info("Starting in fallback mode (no local model)")

    # Notify dashboard
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": 6, "status": "completed" if model_state["loaded"] else "running",
        "message": f"Inference server running on port {args.port} | Model: {'loaded' if model_state['loaded'] else 'fallback mode'}",
        "progress": 1.0, "timestamp": datetime.utcnow().isoformat()
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/phase-update",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"API notify failed: {e}")

    # Start FastAPI
    try:
        import uvicorn
    except ImportError:
        log.info("Installing uvicorn...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "fastapi", "uvicorn"], check=True)
        import uvicorn

    app = create_fastapi_app()
    log.info(f"\n✓ DE-COT inference server starting on port {args.port}")
    log.info(f"  Model loaded: {model_state['loaded']}")
    log.info(f"  Docs: http://localhost:{args.port}/docs")

    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
