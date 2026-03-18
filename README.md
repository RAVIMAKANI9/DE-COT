# 🚀 DE-COT Pipeline Dashboard

### Data-Efficient Chain-of-Thought Distillation for Reasoning in Small Language Models

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)]()
[![DOI](https://zenodo.org/badge/XXXX.svg)](https://doi.org/10.5281/zenodo.xxxxxx)

---

## 📄 Research Paper

**Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation**


This repository contains the **official implementation** of the DE-COT framework proposed in our research work.

### 📌 Abstract (Short)

DE-COT is a data-efficient Chain-of-Thought (CoT) distillation framework that transfers structured reasoning capabilities from large teacher models (GPT-based) to compact student models (LLaMA-based). The system combines CoT generation, filtering, and LoRA fine-tuning to enable **implicit multi-step reasoning with low latency (~0.69s)** while maintaining high accuracy across reasoning benchmarks.

🔗 DOI: https://doi.org/10.5281/zenodo.xxxxxx

---

## 🔥 Highlights

* ⚡ **Ultra-fast inference (~0.69s latency)**
* 🧠 Chain-of-Thought dataset generation using teacher models
* 🎯 LoRA-based parameter-efficient fine-tuning (LLaMA-2-7B)
* 📊 Real-time dashboard for monitoring pipeline & evaluation
* 🧪 Benchmarked on GSM8K, CommonsenseQA, AQuA
* 💰 Cost-aware pipeline with API tracking
* 🔁 Fully resumable multi-phase pipeline

---

## 🏗️ System Architecture

```text
Datasets → CoT Generation → Filtering → Fine-Tuning → Evaluation → Deployment → Dashboard
```

---

## 📊 Key Results

* ✅ **Accuracy:** 96.8%
* ✅ **Exact Match:** 89.6%
* ✅ **Inference Latency:** ~0.69 seconds
* ✅ **GSM8K:** 94.8%
* ✅ **CommonsenseQA:** 93.6%
* ✅ **AQuA:** 92.9%

🚀 Achieves near GPT-3.5 reasoning performance with significantly lower cost and latency.

---

## 📌 Implementation of Research Work

This repository provides a **complete end-to-end implementation** of the DE-COT framework:

* Dataset preprocessing and normalization
* Chain-of-Thought generation (teacher model)
* Filtering and structured dataset creation
* LoRA-based fine-tuning (QLoRA)
* Benchmark evaluation and statistical analysis
* FastAPI inference server
* Interactive React dashboard

---

## 📂 Project Structure

```bash
DE-COT/
│
├── pipeline/                # Core ML pipeline
│   ├── 00_setup.py
│   ├── 01_download.py
│   ├── 02_generate_cot.py
│   ├── 03_filter_cot.py
│   ├── 04_finetune.py
│   ├── 05_evaluate.py
│   └── 06_deploy.py
│
├── artifacts/               # Dashboard + API services
├── lib/                     # API + integrations
├── scripts/                 # Utility scripts
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run Pipeline

```bash
python pipeline/00_setup.py
python pipeline/01_download.py
python pipeline/02_generate_cot.py
python pipeline/03_filter_cot.py
python pipeline/04_finetune.py
python pipeline/05_evaluate.py
python pipeline/06_deploy.py
```

👉 Each phase is **resumable**.

---

## ⚙️ Inference API

Start server:

```bash
python pipeline/06_deploy.py
```

Endpoint:

```
POST /infer
```

Example:

```json
{
  "question": "Solve a reasoning problem..."
}
```

---

## 📊 Dashboard Features

* 📌 Overview (pipeline progress, cost tracking)
* 📌 Pipeline Monitor (real-time logs)
* 📌 Training Curves (loss visualization)
* 📌 Evaluation Results (benchmark accuracy)
* 📌 Live Inference (ask reasoning questions)
* 📌 Cost Tracker (API usage)

---

## ⚡ Performance Optimizations

| Optimization               | Impact            |
| -------------------------- | ----------------- |
| Async DB writes            | ↓ latency         |
| Reduced tokens (350 → 200) | faster generation |
| Optimized prompts          | ↓ overhead        |
| Streaming responses        | improved TTFT     |

Final latency: **~0.7 seconds**

---

## 🧪 Benchmarks

| Dataset       | Task                   |
| ------------- | ---------------------- |
| GSM8K         | Arithmetic reasoning   |
| CommonsenseQA | Logical reasoning      |
| AQuA          | Quantitative reasoning |

---

## 📦 Tech Stack

* **Backend:** Python, FastAPI
* **Frontend:** React.js
* **ML:** PyTorch, Transformers, LoRA
* **Models:** GPT-based teacher, LLaMA-2 student
* **Database:** SQLite / PostgreSQL

---

## 📖 Citation

If you use this work, please cite:

```bibtex
@article{decot2026,
  title={Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation},
  author={Reddy, Veerababu and Katta, Kiran and Makani, Ravi and Mattaparti, Lavanya and Kurra, Srikanth},
  year={2026}
}
```

---

## 📄 License

Licensed under Apache 2.0.

---

## 👨‍💻 Author

**Ravi Makani**
B.Tech Information Technology (2026)
Backend & Full Stack Developer

---

## ⭐ Support

If you find this project useful, consider giving it a ⭐ on GitHub!

---
