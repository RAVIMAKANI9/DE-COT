#!/usr/bin/env python3
"""
Phase 3: Validate, filter, and build a high-quality CoT training set.

Filtering criteria:
1. Answer correctness: CoT response contains the correct final answer
2. Reasoning length: Minimum token count for meaningful reasoning
3. Format validity: Has a clear reasoning chain + answer
4. Deduplication: Remove near-duplicate questions
5. Balance: Optional per-benchmark sample balancing

Output: outputs/cot_filtered/train.jsonl (SFT-ready format)
"""
import os
import sys
import json
import re
import logging
from pathlib import Path
from datetime import datetime
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase3_filter.log"),
    ],
)
log = logging.getLogger(__name__)

# Filtering thresholds
MIN_REASONING_WORDS = 30
MIN_COT_LENGTH = 100
MAX_COT_LENGTH = 4000
MAX_SAMPLES_PER_BENCHMARK = None  # None = no limit


def extract_answer(cot_text: str, benchmark: str) -> str:
    """Extract the predicted answer from a CoT response."""
    if not cot_text:
        return ""

    cot_lower = cot_text.lower()

    # Look for explicit ANSWER: marker first
    answer_match = re.search(r"ANSWER:\s*([A-Ea-e0-9,.\-\$]+)", cot_text)
    if answer_match:
        return answer_match.group(1).strip()

    if benchmark == "gsm8k":
        # Look for the last number in the text
        numbers = re.findall(r"[\$]?[\d,]+\.?\d*", cot_text)
        if numbers:
            return numbers[-1].replace(",", "").replace("$", "").strip()

    elif benchmark in ("commonsenseqa", "aqua"):
        # Look for letter answer
        letter_match = re.search(r"\b([A-Ea-e])\b[\.\s]*$", cot_text.strip())
        if letter_match:
            return letter_match.group(1).upper()
        # Scan whole text for letter patterns
        for pattern in [r"answer is ([A-Ea-e])", r"option ([A-Ea-e])", r"choice ([A-Ea-e])"]:
            m = re.search(pattern, cot_lower)
            if m:
                return m.group(1).upper()

    return ""


def normalize_answer(answer: str, benchmark: str) -> str:
    """Normalize answers for comparison."""
    if not answer:
        return ""
    answer = answer.strip().upper().replace(",", "").replace("$", "")
    if benchmark == "gsm8k":
        try:
            return str(int(float(answer)))
        except (ValueError, OverflowError):
            return answer
    return answer


def check_answer_correctness(cot_text: str, ground_truth: str, benchmark: str) -> bool:
    """Check if the CoT response contains the correct answer."""
    if not cot_text or not ground_truth:
        return False

    predicted = extract_answer(cot_text, benchmark)
    pred_norm = normalize_answer(predicted, benchmark)
    gt_norm = normalize_answer(ground_truth, benchmark)

    if pred_norm == gt_norm:
        return True

    # Fuzzy check: does the ground truth appear anywhere in the text?
    if gt_norm and len(gt_norm) <= 3:
        cot_norm = normalize_answer(cot_text, benchmark)
        return gt_norm in cot_norm

    return False


def passes_quality_filters(record: dict) -> tuple[bool, str]:
    """Return (passes, reason_if_rejected)."""
    cot = record.get("cot_reasoning", "")

    if not cot:
        return False, "no_cot"

    if len(cot) < MIN_COT_LENGTH:
        return False, f"too_short_{len(cot)}"

    if len(cot) > MAX_COT_LENGTH:
        return False, "too_long"

    word_count = len(cot.split())
    if word_count < MIN_REASONING_WORDS:
        return False, f"too_few_words_{word_count}"

    # Check for generic/empty responses
    if cot.lower().strip() in ("i don't know", "i cannot", "unknown", "n/a"):
        return False, "generic_response"

    return True, ""


def format_for_sft(record: dict) -> dict:
    """Format a record for supervised fine-tuning (Alpaca/SFT format)."""
    benchmark = record.get("benchmark", "general")
    question = record["question"]
    cot = record["cot_reasoning"]

    # For DE-COT: we train on question -> answer ONLY (no explicit CoT at inference)
    # The CoT is used only during training to guide the model
    instruction = question
    response = record.get("ground_truth", "")

    # Full SFT record includes CoT for the training signal
    return {
        "instruction": instruction,
        "input": "",
        "output": response,
        "cot_reasoning": cot,  # Used during training but not at inference
        "benchmark": benchmark,
        "original_id": record.get("id", ""),
    }


def main():
    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 3: CoT Filtering & Quality Control")
    log.info("=" * 60)

    cot_file = Path("outputs/cot_data/cot_traces_final.jsonl")
    if not cot_file.exists():
        # Try checkpoint
        cot_file = Path("outputs/cot_data/cot_traces.jsonl")
    if not cot_file.exists():
        log.error("No CoT file found. Run Phase 2 first.")
        sys.exit(1)

    # Load all records
    records = []
    with open(cot_file) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    log.info(f"Loaded {len(records)} raw CoT records")

    # Stats
    stats = {
        "total": len(records),
        "passed": 0,
        "rejected": defaultdict(int),
        "by_benchmark": defaultdict(lambda: {"total": 0, "passed": 0}),
    }

    filtered = []
    seen_questions = set()

    for record in records:
        benchmark = record.get("benchmark", "general")
        stats["by_benchmark"][benchmark]["total"] += 1

        # 1. Deduplication
        q_key = record["question"][:100].lower().strip()
        if q_key in seen_questions:
            stats["rejected"]["duplicate"] += 1
            continue
        seen_questions.add(q_key)

        # 2. Quality filters
        passes, reason = passes_quality_filters(record)
        if not passes:
            stats["rejected"][reason] += 1
            continue

        # 3. Answer correctness
        correct = check_answer_correctness(
            record["cot_reasoning"],
            record.get("ground_truth", ""),
            benchmark
        )
        if not correct:
            stats["rejected"]["wrong_answer"] += 1
            continue

        # Per-benchmark limit
        bm_stats = stats["by_benchmark"][benchmark]
        if MAX_SAMPLES_PER_BENCHMARK and bm_stats["passed"] >= MAX_SAMPLES_PER_BENCHMARK:
            stats["rejected"]["benchmark_limit"] += 1
            continue

        # Format for SFT
        sft_record = format_for_sft(record)
        filtered.append(sft_record)
        stats["passed"] += 1
        bm_stats["passed"] += 1

    # Save filtered training set
    out_dir = Path("outputs/cot_filtered")
    out_dir.mkdir(parents=True, exist_ok=True)

    train_file = out_dir / "train.jsonl"
    with open(train_file, "w") as f:
        for r in filtered:
            f.write(json.dumps(r) + "\n")

    # Save stats
    stats_file = out_dir / "filter_stats.json"
    stats_report = {
        "total_input": stats["total"],
        "total_passed": stats["passed"],
        "pass_rate": stats["passed"] / max(stats["total"], 1),
        "rejected_by_reason": dict(stats["rejected"]),
        "by_benchmark": {k: dict(v) for k, v in stats["by_benchmark"].items()},
        "filtered_at": datetime.utcnow().isoformat(),
    }
    stats_file.write_text(json.dumps(stats_report, indent=2))

    # Report
    log.info(f"\n{'='*40}")
    log.info(f"FILTERING RESULTS")
    log.info(f"{'='*40}")
    log.info(f"Input:    {stats['total']}")
    log.info(f"Passed:   {stats['passed']} ({stats_report['pass_rate']*100:.1f}%)")
    log.info(f"Rejected: {stats['total'] - stats['passed']}")
    log.info(f"\nRejection reasons:")
    for reason, count in stats["rejected"].items():
        log.info(f"  {reason}: {count}")
    log.info(f"\nBy benchmark:")
    for bm, bm_stats in stats["by_benchmark"].items():
        rate = bm_stats["passed"] / max(bm_stats["total"], 1)
        log.info(f"  {bm}: {bm_stats['passed']}/{bm_stats['total']} ({rate*100:.1f}%)")

    # Update state
    state_path = Path("outputs/pipeline_state.json")
    if state_path.exists():
        state = json.loads(state_path.read_text())
    else:
        state = {}
    state["phase3_completed"] = True
    state["filtered_cot_samples"] = stats["passed"]
    state["filter_stats"] = stats_report
    state["updated_at"] = datetime.utcnow().isoformat()
    state_path.write_text(json.dumps(state, indent=2))

    # Notify API
    import urllib.request
    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": 3, "status": "completed",
        "message": f"Filtered to {stats['passed']} high-quality CoT examples ({stats_report['pass_rate']*100:.1f}% pass rate)",
        "progress": 1.0,
        "metadata": stats_report,
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

    log.info(f"\n✓ Phase 3 complete — {stats['passed']} filtered examples saved to {train_file}")
    log.info("Next step: python pipeline/04_finetune.py")


if __name__ == "__main__":
    main()
