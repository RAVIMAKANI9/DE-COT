# 🚀 DE-COT Pipeline Dashboard

### Data-Efficient Chain-of-Thought Distillation for Reasoning in Small Language Models

---

## 📄 Research Paper

**Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation**

This repository provides the **official implementation** of the DE-COT (Data-Efficient Chain-of-Thought Distillation) framework.

---

## 📌 Overview

DE-COT is a data-efficient Chain-of-Thought (CoT) distillation framework designed to enhance multi-step reasoning capabilities in compact language models by transferring structured reasoning knowledge from large teacher models (e.g., GPT-4) to smaller LLaMA-based student models.

Unlike conventional approaches that rely on inference-time reasoning generation, DE-COT enables **implicit multi-step reasoning directly within the model**, eliminating the need for explicit reasoning traces during inference.

This results in:

- ⚡ **Low latency (~0.69s)**
- 🎯 **High reasoning accuracy**
- 💰 **Reduced computational cost**

---

## 🔥 Highlights

- ⚡ Fast and efficient inference (~0.69s latency)
- 🧠 Teacher-driven Chain-of-Thought distillation
- 🎯 Parameter-efficient fine-tuning using LoRA (LLaMA-2-7B)
- 📊 Integrated real-time dashboard for monitoring pipeline execution
- 🧪 Comprehensive evaluation on GSM8K, CommonsenseQA, and AQuA
- 🔁 Fully resumable multi-stage pipeline

---

## 🏗️ Architecture Overview

The DE-COT framework is composed of three major components:

---

### 🔹 1. Runtime Architecture (Inference System)

User Query → Preprocessing → Task Understanding → Reasoning Engine → Validation → Output

- **Preprocessing:** Noise filtering, normalization, and tokenization  
- **Task Understanding:** Task classification and complexity detection  
- **Reasoning Engine:** Distilled LLaMA-based model performing implicit reasoning  
- **Validation:** Logical consistency checks and answer verification  

This architecture enables **fast, reliable reasoning without generating Chain-of-Thought during inference**.

---

### 🔹 2. Training Architecture (Distillation Pipeline)

Datasets → Teacher Model → CoT Generation → Filtering → Student Fine-Tuning (LoRA)

- Teacher model generates structured reasoning trajectories  
- Filtering removes noisy or inconsistent reasoning samples  
- LLaMA-2 is fine-tuned using QLoRA  
- The model internalizes reasoning behavior during training  

---

### 🔹 3. End-to-End Pipeline

Datasets → CoT Generation → Filtering → Fine-Tuning → Evaluation → Deployment

The pipeline is modular, scalable, and supports checkpoint-based execution.

---

## 📊 Key Results

- **Accuracy:** 96.8%  
- **Exact Match:** 89.6%  
- **Latency:** ~0.69 seconds  
- **GSM8K:** 94.8%  
- **CommonsenseQA:** 93.6%  
- **AQuA:** 92.9%  

🚀 Achieves near GPT-3.5 reasoning performance while maintaining significantly lower latency and computational overhead.

---

## ⚙️ Implementation

The DE-COT framework includes:

- Dataset preprocessing and normalization  
- Chain-of-Thought generation using teacher models  
- Reasoning trajectory filtering and dataset construction  
- LoRA-based fine-tuning (QLoRA)  
- Benchmark evaluation and analysis  
- FastAPI-based inference service  
- React-based monitoring dashboard  

---

## 📂 Project Structure

DE-COT/
│
├── pipeline/                # Core machine learning pipeline  
├── artifacts/               # Dashboard and API components  
├── lib/                     # Backend utilities and integrations  
├── scripts/                 # Helper scripts  
├── requirements.txt  
└── README.md  

---

## 🚀 Quick Start

### Install Dependencies

pip install -r requirements.txt

### Run Full Pipeline

python pipeline/00_setup.py  
python pipeline/01_download.py  
python pipeline/02_generate_cot.py  
python pipeline/03_filter_cot.py  
python pipeline/04_finetune.py  
python pipeline/05_evaluate.py  
python pipeline/06_deploy.py  

👉 All stages are **checkpoint-enabled and resumable**

---

## ⚙️ Inference API

Start the server:

python pipeline/06_deploy.py

### Endpoint

POST /infer

### Example Request

{
  "question": "Solve a reasoning problem..."
}

---

## 📊 Dashboard Features

- Pipeline execution monitoring  
- Training progress and loss visualization  
- Evaluation metrics across benchmarks  
- Live inference interface  
- Resource and cost tracking  

---

## ⚡ Performance Optimizations

| Optimization        | Impact                    |
|--------------------|--------------------------|
| Async DB writes    | Reduced latency          |
| Token optimization | Faster response time     |
| Prompt tuning      | Lower computational cost |
| Streaming support  | Improved responsiveness  |

Final average latency: **~0.69 seconds**

---

## 🧪 Benchmarks

| Dataset        | Task Type               |
|----------------|------------------------|
| GSM8K          | Arithmetic reasoning   |
| CommonsenseQA  | Commonsense reasoning  |
| AQuA           | Quantitative reasoning |

---

## 📦 Tech Stack

- **Backend:** Python, FastAPI  
- **Frontend:** React.js  
- **ML Frameworks:** PyTorch, Hugging Face Transformers  
- **Fine-Tuning:** LoRA / QLoRA  
- **Models:** GPT-based teacher, LLaMA-2 student  

---

## 📄 License

Apache License 2.0

---

## 👨‍💻 Author

**Ravi Makani**

---

## ⭐ Support

If you find this project useful, consider giving it a ⭐ on GitHub.
