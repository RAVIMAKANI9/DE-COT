# DE-COT Reasoning Agent

Data-Efficient Chain-of-Thought Distillation Pipeline — full end-to-end implementation.

**Teacher**: GPT-4 (via OpenAI API)  
**Student**: Llama-2-7B (via HuggingFace)  
**Technique**: CoT generation → filtering → LoRA fine-tuning → implicit reasoning at inference  
**Targets**: GSM8K ≥94% | CommonsenseQA ≥93% | AQuA ≥92%

---

## Setup

### 1. Install secrets (already done in Replit)
- `OPENAI_API_KEY` — Required for Phase 2 (CoT generation)
- `HF_TOKEN` — Required for Llama-2-7B download

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

---

## Running the Pipeline

Run phases in order. Each phase is resumable if interrupted.

### Phase 0 — Environment Setup
```bash
python pipeline/00_setup.py
```
Validates secrets, installs ML packages, checks GPU, creates directories.

### Phase 1 — Dataset Download
```bash
python pipeline/01_download.py
```
Downloads GSM8K, CommonsenseQA, AQuA-RAT from HuggingFace. Saves as parquet.

### Phase 2 — CoT Generation (GPT-4)
```bash
# Default: gpt-4o-mini, all samples
python pipeline/02_generate_cot.py

# Options:
python pipeline/02_generate_cot.py --model gpt-4o-mini --max-samples 1000 --cost-limit 120
python pipeline/02_generate_cot.py --benchmark gsm8k  # Only one benchmark
```
Generates chain-of-thought traces. **Resumable** — restarts from last checkpoint.  
Cost limit: $120 (configurable). Tracks cost in dashboard.

### Phase 3 — Filtering & Quality Control
```bash
python pipeline/03_filter_cot.py
```
Filters CoT traces by: answer correctness, reasoning length, deduplication.

### Phase 4 — LoRA Fine-tuning
```bash
# Full run (GPU recommended)
python pipeline/04_finetune.py --model meta-llama/Llama-2-7b-hf --epochs 3

# Quick test (100 samples)
python pipeline/04_finetune.py --test-run

# Resume interrupted training (automatic — looks for checkpoints)
python pipeline/04_finetune.py
```
Uses QLoRA (4-bit) to fit in ≤24GB VRAM. LoRA rank=64, alpha=128.  
**Resumable** — detects and continues from `outputs/checkpoints/`.

### Phase 5 — Evaluation
```bash
python pipeline/05_evaluate.py --max-samples 200
```
Evaluates on all benchmarks. Prints paper-style accuracy table.

### Phase 6 — Deploy Inference Server
```bash
# With loaded model
python pipeline/06_deploy.py

# Fallback mode (uses GPT-4o-mini, no local model needed)
python pipeline/06_deploy.py --no-model-load
```
Starts FastAPI server on port 8000. No explicit CoT at inference time.

---

## Dashboard

The React dashboard runs at `/` and shows:
- **Overview** — pipeline phase status cards
- **Pipeline Monitor** — detailed phase progress
- **Training Curves** — live loss chart
- **Evaluation Results** — accuracy vs targets
- **Live Inference** — test the model
- **Cost Tracker** — OpenAI spend breakdown

---

## Outputs

```
outputs/
├── cot_data/           # Raw GPT-4 CoT traces (JSONL)
├── cot_filtered/       # Filtered high-quality training set
│   └── train.jsonl     # SFT-ready training data
├── checkpoints/        # Training checkpoints (resumable)
├── final_adapter/      # Merged LoRA adapter
│   ├── adapter_config.json
│   └── training_config.json
└── evals/              # Evaluation results
pipeline_state.json     # Cross-phase state file
```

---

## Architecture

```
GSM8K + CommonsenseQA + AQuA-RAT
          ↓ Phase 1
    Standardized datasets (parquet)
          ↓ Phase 2
    GPT-4 CoT traces (JSONL) — ~$80-120
          ↓ Phase 3
    Filtered high-quality CoT (≥30% pass rate)
          ↓ Phase 4
    Llama-2-7B + QLoRA (4-bit) fine-tuning
          ↓ Phase 5
    Evaluation: GSM8K/CSQA/AQuA
          ↓ Phase 6
    FastAPI inference (no explicit CoT at runtime)
```

## Cost Estimates

| Phase | Cost |
|-------|------|
| Phase 2 (CoT generation, gpt-4o-mini) | ~$30–80 |
| Phase 4 (GPU training, Replit) | GPU hours |
| **Total OpenAI spend** | **<$120** |

## Performance Targets

| Benchmark | Target | Paper |
|-----------|--------|-------|
| GSM8K | ≥94% | 94.2% |
| CommonsenseQA | ≥93% | 93.4% |
| AQuA-RAT | ≥92% | 92.1% |
| Inference latency | 0.6–0.9s | ~0.7s |
