# 🚀 DE-COT 

### Data-Efficient Chain-of-Thought Distillation for Reasoning in Small Language Models

[![DOI](https://zenodo.org/badge/1185174063.svg)](https://doi.org/10.5281/zenodo.19131477)



## 📄 Research Paper

**Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation**

This repository is directly associated with the manuscript submitted to *Applied Intelligence* and enables full experimental reproducibility.

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
├── pipeline/                # Core machine learning pipeline  
├── artifacts/               # Dashboard and API components  
├── lib/                     # Backend utilities and integrations  
├── scripts/                 # Helper scripts  
├── requirements.txt  
└── README.md  

---

## 🚀 Quick Start

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Full Pipeline

```bash
python pipeline/00_setup.py
python pipeline/01_download.py
python pipeline/02_generate_cot.py
python pipeline/03_filter_cot.py
python pipeline/04_finetune.py
python pipeline/05_evaluate.py
python pipeline/06_deploy.py
```

👉 All stages are **checkpoint-enabled and resumable**

---

## ⚙️ Inference API

Start the server:

```bash
python pipeline/06_deploy.py
```

### Endpoint

POST /infer

### Example Request

```json
{
  "question": "Solve a reasoning problem..."
}
```

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

## 🔁 Reproducibility and Open-Source Availability

This repository follows reproducible research best practices aligned with Springer and Applied Intelligence publication standards.

To ensure full transparency and reproducibility of the proposed DE-COT framework, the complete implementation is publicly available with comprehensive documentation and usage guidelines.

The repository includes all necessary components required to replicate the experiments and evaluate the results:

- Environment setup and dependencies  
- Dataset preprocessing and preparation scripts  
- Chain-of-Thought (CoT) generation pipeline  
- Reasoning trajectory filtering and dataset construction  
- Model training and fine-tuning configurations (LoRA / QLoRA)  
- Evaluation scripts and benchmarking workflows  
- Deployment-ready inference pipeline  

📌 **GitHub Repository:** *https://github.com/RAVIMAKANI9/DE-COT*  

📌 **Permanent Archive (DOI):**  
https://doi.org/10.5281/zenodo.19131477  

All benchmark datasets used (GSM8K, CommonsenseQA, and AQuA) are publicly available under their respective licenses and are referenced within the repository.

A permanent version of the code and associated research artifacts is archived on Zenodo with an assigned DOI to ensure long-term accessibility, reproducibility, and citation within the scientific community.

---

## 📌 Relation to Manuscript

This repository contains the official implementation corresponding to the manuscript:

**"Enhancing Reasoning in Small Language Models through Data Efficient Chain of Thought Distillation"**

All code, experiments, and results provided in this repository are directly associated with the methods and evaluations described in the manuscript.
This implementation enables full reproducibility of all experimental results reported in the manuscript.

---

## ⭐ Citation

If you use this repository, dataset, or framework in your research, please cite the following work:


```
Makani, R., et al. (2026).
DE-COT: Data-Efficient Chain-of-Thought Distillation Framework.
https://doi.org/10.5281/zenodo.19131477
```

---

## 👨‍💻 Author

**Ravi Makani**

---

## 📄 License

Apache License 2.0

---

## ⭐ Support

If you find this project useful, consider giving it a ⭐ on GitHub.

---

[![DOI](https://zenodo.org/badge/1185174063.svg)](https://doi.org/10.5281/zenodo.19131477)
