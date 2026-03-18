# 🚀 DE-COT Pipeline Dashboard

### Data-Efficient Chain-of-Thought Distillation for Reasoning in Small Language Models

---

## 📄 Research Paper

**Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation**


This repository provides the **official implementation** of the DE-COT framework.

---

## 📌 Overview

DE-COT is a data-efficient Chain-of-Thought (CoT) distillation framework that transfers structured reasoning capabilities from large teacher models (e.g., GPT-4) to compact student models (LLaMA-based).

Unlike traditional approaches, DE-COT enables **implicit multi-step reasoning without generating reasoning traces at inference time**, achieving:

* ⚡ Low latency (~0.69s)
* 🎯 High reasoning accuracy
* 💰 Reduced computational cost

---

## 🔥 Highlights

* ⚡ **Fast inference (~0.69s latency)**
* 🧠 Teacher-driven Chain-of-Thought distillation
* 🎯 LoRA-based fine-tuning (LLaMA-2-7B)
* 📊 Real-time dashboard for monitoring pipeline
* 🧪 Evaluated on GSM8K, CommonsenseQA, AQuA
* 🔁 Fully resumable multi-stage pipeline

---

## 🏗️ Architecture Overview

The DE-COT framework consists of three core components:

---

### 🔹 1. Runtime Architecture (Inference System)

```text
User Query → Preprocessing → Task Understanding → Reasoning Engine → Validation → Output
```

* Preprocessing: noise filtering, normalization, tokenization
* Task Understanding: classification + complexity detection
* Reasoning Engine: distilled LLaMA model (implicit reasoning)
* Validation: logical checks + answer verification

👉 Enables **fast and reliable reasoning without CoT at inference**

---

### 🔹 2. Training Architecture (Distillation Pipeline)

```text
Datasets → GPT-4 (Teacher) → CoT Generation → Filtering → LLaMA Fine-Tuning (LoRA)
```

* GPT-4 generates structured reasoning traces
* Filtering removes noisy/low-quality samples
* LLaMA-2 is fine-tuned using QLoRA
* Model learns reasoning internally

---

### 🔹 3. End-to-End Pipeline

```text
Datasets → CoT Generation → Filtering → Fine-Tuning → Evaluation → Deployment
```

---

## 📊 Key Results

* **Accuracy:** 96.8%
* **Exact Match:** 89.6%
* **Latency:** ~0.69 seconds
* **GSM8K:** 94.8%
* **CommonsenseQA:** 93.6%
* **AQuA:** 92.9%

🚀 Near GPT-3.5 reasoning performance with significantly lower latency and cost.

---

## ⚙️ Implementation

* Dataset preprocessing and normalization
* Chain-of-Thought generation (teacher model)
* Filtering and dataset construction
* LoRA-based fine-tuning (QLoRA)
* Benchmark evaluation
* FastAPI inference server
* React-based dashboard

---

## 📂 Project Structure

```bash
DE-COT/
│
├── pipeline/                # Core ML pipeline
├── artifacts/               # Dashboard + API services
├── lib/                     # Backend integrations
├── scripts/                 # Utilities
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Start

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Pipeline

```bash
python pipeline/00_setup.py
python pipeline/01_download.py
python pipeline/02_generate_cot.py
python pipeline/03_filter_cot.py
python pipeline/04_finetune.py
python pipeline/05_evaluate.py
python pipeline/06_deploy.py
```

👉 All phases are **resumable**

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

* Overview (pipeline progress & cost tracking)
* Pipeline Monitor (logs)
* Training Curves (loss visualization)
* Evaluation Results
* Live Inference
* Cost Tracker

---

## ⚡ Performance Optimizations

| Optimization      | Impact           |
| ----------------- | ---------------- |
| Async DB writes   | Reduced latency  |
| Token reduction   | Faster responses |
| Optimized prompts | Lower overhead   |
| Streaming         | Improved speed   |

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



## 📄 License

Apache 2.0

---

## 👨‍💻 Author

**Ravi Makani**

---

## ⭐ Support

If you find this project useful, consider giving it a ⭐ on GitHub!

---
