#!/usr/bin/env python3
"""
Phase 2: Generate Chain-of-Thought reasoning traces using GPT-4.

Features:
- Resumable: tracks progress in a checkpoint file
- Cost tracking: logs token counts and USD cost per batch
- Few-shot CoT prompting with benchmark-specific examples
- Batching with rate-limit handling
- Structured output format for filtering in Phase 3

Usage:
    python pipeline/02_generate_cot.py [--model gpt-4o-mini] [--max-samples 1000] [--batch-size 20]
"""
import os
import sys
import json
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase2_generate_cot.log"),
    ],
)
log = logging.getLogger(__name__)

# Pricing per 1M tokens (USD) — update if model changes
MODEL_PRICING = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 5.00, "output": 15.00},
    "gpt-4-turbo-2024-04-09": {"input": 10.00, "output": 30.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
}

FEW_SHOT_PROMPTS = {
    "gsm8k": """You are an expert math tutor. Solve the following problem step by step, then give the final numeric answer.

Example:
Q: Janet's ducks lay 16 eggs per day. She eats 3 for breakfast and bakes with 4. She sells the rest for $2 each. How much does she make per day?
A: Janet has 16 - 3 - 4 = 9 eggs left. She earns 9 × $2 = $18 per day.
ANSWER: 18

Now solve:
Q: {question}
A:""",

    "commonsenseqa": """You are a reasoning expert. Answer the multiple-choice question using common sense and logical reasoning. Explain your reasoning briefly, then give the letter answer.

Example:
Q: The man was known for making horses feel at ease, he had a special connection to them, what was he? Choices: A: horse whisperer | B: veterinarian | C: jockey | D: cowboy | E: rancher
Reasoning: A "horse whisperer" specifically refers to someone with a special ability to calm and communicate with horses.
ANSWER: A

Now solve:
Q: {question}
Reasoning:""",

    "aqua": """You are a quantitative reasoning expert. Solve the math word problem step by step, then choose the correct option.

Example:
Q: If 6 men can do a job in 8 days, how many days will 3 men take? Options: A) 4 | B) 8 | C) 12 | D) 16 | E) 24
Reasoning: 6 men × 8 days = 48 man-days total. With 3 men: 48 / 3 = 16 days.
ANSWER: D

Now solve:
Q: {question}
Reasoning:""",
}

DEFAULT_PROMPT = """You are an expert reasoner. Solve the following problem step by step with clear logical reasoning, then give your final answer.

Q: {question}
A:"""


def get_few_shot_prompt(question: str, benchmark: str) -> str:
    template = FEW_SHOT_PROMPTS.get(benchmark, DEFAULT_PROMPT)
    return template.format(question=question)


def compute_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["gpt-4o-mini"])
    cost = (input_tokens / 1_000_000) * pricing["input"]
    cost += (output_tokens / 1_000_000) * pricing["output"]
    return cost


def load_checkpoint(path: Path) -> dict:
    if path.exists():
        data = json.loads(path.read_text())
        log.info(f"Resuming from checkpoint: {data.get('processed', 0)} examples done")
        return data
    return {"processed": 0, "total_input_tokens": 0, "total_output_tokens": 0, "total_cost_usd": 0.0, "results": []}


def save_checkpoint(path: Path, state: dict):
    path.write_text(json.dumps(state, indent=2))


def notify_api_cost(phase: int, input_tok: int, output_tok: int, cost: float, req_count: int):
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": phase, "inputTokens": input_tok, "outputTokens": output_tok,
        "costUsd": cost, "requestCount": req_count
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/cost-update",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"Cost notify failed: {e}")


def notify_api_phase(phase: int, status: str, message: str, progress: float = None):
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": phase, "status": status, "message": message,
        "progress": progress, "timestamp": datetime.utcnow().isoformat()
    }).encode()
    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/phase-update",
            data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        log.debug(f"Phase notify failed: {e}")


def generate_cot_batch(client, examples: list, model: str, checkpoint: dict) -> list:
    """Generate CoT for a batch of examples. Returns list of result dicts."""
    results = []

    for ex in examples:
        question = ex["question"]
        benchmark = ex.get("benchmark", "general")
        prompt = get_few_shot_prompt(question, benchmark)

        retries = 3
        for attempt in range(retries):
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=512,
                    temperature=0.3,
                )
                cot_text = response.choices[0].message.content.strip()
                input_tokens = response.usage.prompt_tokens
                output_tokens = response.usage.completion_tokens
                cost = compute_cost(input_tokens, output_tokens, model)

                checkpoint["total_input_tokens"] += input_tokens
                checkpoint["total_output_tokens"] += output_tokens
                checkpoint["total_cost_usd"] += cost

                result = {
                    "id": ex.get("id", ""),
                    "question": question,
                    "ground_truth": ex.get("answer", ""),
                    "benchmark": benchmark,
                    "choices": ex.get("choices"),
                    "cot_reasoning": cot_text,
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_usd": cost,
                    "generated_at": datetime.utcnow().isoformat(),
                }
                results.append(result)
                break

            except Exception as e:
                if attempt < retries - 1:
                    wait = 2 ** attempt * 5
                    log.warning(f"  API error (attempt {attempt+1}): {e} — retrying in {wait}s")
                    time.sleep(wait)
                else:
                    log.error(f"  Failed after {retries} attempts: {e}")
                    results.append({
                        "id": ex.get("id", ""),
                        "question": question,
                        "ground_truth": ex.get("answer", ""),
                        "benchmark": benchmark,
                        "choices": ex.get("choices"),
                        "cot_reasoning": None,
                        "model": model,
                        "error": str(e),
                    })

        # Rate limit buffer
        time.sleep(0.1)

    return results


def main():
    parser = argparse.ArgumentParser(description="Phase 2: Generate CoT traces")
    parser.add_argument("--model", default="gpt-4o-mini", choices=list(MODEL_PRICING.keys()))
    parser.add_argument("--max-samples", type=int, default=None, help="Max samples per dataset")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--cost-limit", type=float, default=120.0, help="Stop if cost exceeds this USD")
    parser.add_argument("--benchmark", default=None, help="Only process this benchmark (gsm8k/commonsenseqa/aqua)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 2: CoT Generation")
    log.info(f"Model: {args.model} | Batch: {args.batch_size} | Cost limit: ${args.cost_limit}")
    log.info("=" * 60)

    import openai
    import pandas as pd

    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    out_dir = Path("outputs/cot_data")
    out_dir.mkdir(parents=True, exist_ok=True)

    notify_api_phase(2, "running", f"Starting CoT generation with {args.model}")

    # Load all training data
    datasets_to_process = ["gsm8k", "commonsenseqa", "aqua_rat"]
    if args.benchmark:
        bm_map = {"gsm8k": "gsm8k", "commonsenseqa": "commonsenseqa", "aqua": "aqua_rat"}
        datasets_to_process = [bm_map.get(args.benchmark, args.benchmark)]

    all_examples = []
    for ds_name in datasets_to_process:
        train_file = Path(f"data/processed/{ds_name}/train.parquet")
        if not train_file.exists():
            log.warning(f"  {ds_name}/train.parquet not found — run Phase 1 first")
            continue
        df = pd.read_parquet(train_file)
        if args.max_samples:
            df = df.head(args.max_samples)
        records = df.to_dict("records")
        all_examples.extend(records)
        log.info(f"  Loaded {len(records)} examples from {ds_name}")

    if not all_examples:
        log.error("No examples loaded. Run Phase 1 first.")
        sys.exit(1)

    # Load checkpoint for resume
    checkpoint_path = Path("outputs/cot_data/checkpoint.json")
    checkpoint = load_checkpoint(checkpoint_path)
    already_done = {r["id"] + r.get("benchmark", "") for r in checkpoint.get("results", []) if r.get("id")}
    remaining = [ex for ex in all_examples if (ex.get("id", "") + ex.get("benchmark", "")) not in already_done]

    log.info(f"\nTotal: {len(all_examples)} | Already done: {len(all_examples) - len(remaining)} | Remaining: {len(remaining)}")
    log.info(f"Current cost: ${checkpoint['total_cost_usd']:.4f} / ${args.cost_limit:.2f}")

    if checkpoint["total_cost_usd"] >= args.cost_limit:
        log.warning(f"Cost limit reached (${checkpoint['total_cost_usd']:.2f}). Stopping.")
        notify_api_phase(2, "completed", f"Cost limit reached at ${checkpoint['total_cost_usd']:.2f}")
        return

    # Process in batches
    for i in range(0, len(remaining), args.batch_size):
        batch = remaining[i: i + args.batch_size]
        log.info(f"\nBatch {i//args.batch_size + 1}: examples {i+1}-{min(i+len(batch), len(remaining))}")

        batch_results = generate_cot_batch(client, batch, args.model, checkpoint)
        checkpoint["results"].extend(batch_results)
        checkpoint["processed"] += len(batch_results)

        # Save checkpoint
        save_checkpoint(checkpoint_path, checkpoint)

        # Save intermediate JSONL
        out_file = out_dir / "cot_traces.jsonl"
        with open(out_file, "w") as f:
            for r in checkpoint["results"]:
                f.write(json.dumps(r) + "\n")

        # Report progress
        progress = checkpoint["processed"] / len(all_examples)
        cost = checkpoint["total_cost_usd"]
        log.info(f"  Progress: {checkpoint['processed']}/{len(all_examples)} ({progress*100:.1f}%) | Cost: ${cost:.4f}")
        notify_api_phase(2, "running", f"Generated {checkpoint['processed']} CoT traces | Cost: ${cost:.4f}", progress)
        notify_api_cost(2, checkpoint["total_input_tokens"], checkpoint["total_output_tokens"], cost, checkpoint["processed"])

        # Stop if cost limit hit
        if cost >= args.cost_limit:
            log.warning(f"Cost limit ${args.cost_limit} reached. Stopping at {checkpoint['processed']} examples.")
            break

    # Final save
    final_path = out_dir / "cot_traces_final.jsonl"
    with open(final_path, "w") as f:
        for r in checkpoint["results"]:
            f.write(json.dumps(r) + "\n")

    # Summary
    successful = sum(1 for r in checkpoint["results"] if r.get("cot_reasoning"))
    log.info(f"\n✓ Phase 2 complete")
    log.info(f"  Total generated: {len(checkpoint['results'])}")
    log.info(f"  Successful: {successful}")
    log.info(f"  Total cost: ${checkpoint['total_cost_usd']:.4f}")
    log.info(f"  Input tokens: {checkpoint['total_input_tokens']:,}")
    log.info(f"  Output tokens: {checkpoint['total_output_tokens']:,}")

    notify_api_phase(2, "completed", f"Generated {successful} CoT traces | Total cost: ${checkpoint['total_cost_usd']:.4f}", 1.0)
    notify_api_cost(2, checkpoint["total_input_tokens"], checkpoint["total_output_tokens"], checkpoint["total_cost_usd"], len(checkpoint["results"]))

    log.info("Next step: python pipeline/03_filter_cot.py")


if __name__ == "__main__":
    main()
