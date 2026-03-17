#!/usr/bin/env python3
"""
Phase 1: Download and standardize datasets.
Downloads GSM8K, CommonsenseQA, AQuA-RAT (and optionally ASDiv/MAWPS).
Saves as parquet files in data/processed/.

Resumable: skips datasets already downloaded.
"""
import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase1_download.log"),
    ],
)
log = logging.getLogger(__name__)

# Target sample counts (None = use all)
DATASET_CONFIG = {
    "gsm8k": {
        "hf_path": "openai/gsm8k",
        "hf_name": "main",
        "splits": ["train", "test"],
        "question_col": "question",
        "answer_col": "answer",
        "benchmark": "gsm8k",
        "max_train": None,
    },
    "commonsenseqa": {
        "hf_path": "tau/commonsense_qa",
        "hf_name": None,
        "splits": ["train", "validation"],
        "question_col": "question",
        "answer_col": "answerKey",
        "choices_col": "choices",
        "benchmark": "commonsenseqa",
        "max_train": None,
    },
    "aqua_rat": {
        "hf_path": "deepmind/aqua_rat",
        "hf_name": "raw",
        "splits": ["train", "test"],
        "question_col": "question",
        "answer_col": "correct",
        "options_col": "options",
        "rationale_col": "rationale",
        "benchmark": "aqua",
        "max_train": None,
    },
}


def update_state(key: str, value):
    state_path = Path("outputs/pipeline_state.json")
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    state[key] = value
    state["updated_at"] = datetime.utcnow().isoformat()
    state_path.write_text(json.dumps(state, indent=2))


def notify_api(phase: int, status: str, message: str, progress: float = None):
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
        log.debug(f"API notify failed: {e}")


def standardize_gsm8k(example: dict) -> dict:
    """Extract final numeric answer from GSM8K answer string."""
    answer_str = example.get("answer", "")
    # GSM8K format: "... #### 42"
    final = answer_str.split("####")[-1].strip().replace(",", "") if "####" in answer_str else answer_str.strip()
    return {
        "id": example.get("id", ""),
        "question": example["question"],
        "answer": final,
        "full_solution": answer_str,
        "benchmark": "gsm8k",
        "choices": None,
    }


def standardize_csqa(example: dict) -> dict:
    """Standardize CommonsenseQA with choices."""
    choices = example.get("choices", {})
    labels = choices.get("label", [])
    texts = choices.get("text", [])
    choices_text = " | ".join([f"{l}: {t}" for l, t in zip(labels, texts)])
    return {
        "id": example.get("id", ""),
        "question": f"{example['question']} Choices: {choices_text}",
        "answer": example.get("answerKey", ""),
        "full_solution": "",
        "benchmark": "commonsenseqa",
        "choices": choices_text,
    }


def standardize_aqua(example: dict) -> dict:
    """Standardize AQuA-RAT with options."""
    options = example.get("options", [])
    opts_text = " | ".join(options) if options else ""
    return {
        "id": "",
        "question": f"{example['question']} Options: {opts_text}",
        "answer": example.get("correct", ""),
        "full_solution": example.get("rationale", ""),
        "benchmark": "aqua",
        "choices": opts_text,
    }


def download_dataset(name: str, config: dict) -> dict:
    """Download and standardize a single dataset. Returns stats."""
    import datasets as hf_datasets
    import pandas as pd

    out_dir = Path("data/processed") / name
    out_dir.mkdir(parents=True, exist_ok=True)

    stats = {"name": name, "splits": {}}

    for split in config["splits"]:
        out_file = out_dir / f"{split}.parquet"
        if out_file.exists():
            log.info(f"  ✓ {name}/{split} already exists — skipping")
            df = pd.read_parquet(out_file)
            stats["splits"][split] = len(df)
            continue

        log.info(f"  Downloading {name}/{split}...")
        try:
            hf_kwargs = {"path": config["hf_path"], "split": split, "trust_remote_code": True}
            if config.get("hf_name"):
                hf_kwargs["name"] = config["hf_name"]

            token = os.environ.get("HF_TOKEN")
            if token:
                hf_kwargs["token"] = token

            dataset = hf_datasets.load_dataset(**hf_kwargs)

            # Apply max limit for train split
            if split == "train" and config.get("max_train"):
                dataset = dataset.select(range(min(config["max_train"], len(dataset))))

            # Standardize
            standardizers = {
                "gsm8k": standardize_gsm8k,
                "commonsenseqa": standardize_csqa,
                "aqua_rat": standardize_aqua,
            }
            std_fn = standardizers.get(name)
            records = [std_fn(ex) for ex in dataset] if std_fn else list(dataset)

            df = pd.DataFrame(records)
            df.to_parquet(out_file, index=False)
            stats["splits"][split] = len(df)
            log.info(f"    ✓ {len(df)} examples saved to {out_file}")

        except Exception as e:
            log.error(f"  ✗ Failed to download {name}/{split}: {e}")
            stats["splits"][split] = 0

    return stats


def main():
    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 1: Dataset Download")
    log.info("=" * 60)

    # Check phase 0 completed
    state_path = Path("outputs/pipeline_state.json")
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if not state.get("phase0_completed"):
            log.error("Phase 0 not completed! Run 00_setup.py first.")
            sys.exit(1)

    notify_api(1, "running", "Downloading datasets...")

    all_stats = []
    total_train = 0

    for i, (name, config) in enumerate(DATASET_CONFIG.items()):
        log.info(f"\n[{i+1}/{len(DATASET_CONFIG)}] Downloading {name}...")
        progress = i / len(DATASET_CONFIG)
        notify_api(1, "running", f"Downloading {name}...", progress)

        stats = download_dataset(name, config)
        all_stats.append(stats)
        train_count = stats["splits"].get("train", 0)
        total_train += train_count
        log.info(f"  → {name}: {train_count} train examples")

    # Save summary
    summary = {
        "datasets": all_stats,
        "total_train_examples": total_train,
        "downloaded_at": datetime.utcnow().isoformat(),
    }
    summary_path = Path("data/processed/summary.json")
    summary_path.write_text(json.dumps(summary, indent=2))

    update_state({
        "phase1_completed": True,
        "total_dataset_samples": total_train,
        "dataset_summary": summary,
    })

    notify_api(1, "completed", f"Downloaded {total_train} total training examples", 1.0)
    log.info(f"\n✓ Phase 1 complete — {total_train} total training examples")
    log.info("Next step: python pipeline/02_generate_cot.py")


if __name__ == "__main__":
    main()
