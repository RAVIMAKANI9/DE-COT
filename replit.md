# DE-COT Reasoning Agent

## Overview

End-to-end Data-Efficient Chain-of-Thought (DE-COT) distillation pipeline + monitoring dashboard.

**Pipeline**: GPT-4 CoT generation → filtering → Llama-2-7B LoRA fine-tuning → implicit reasoning inference  
**Targets**: GSM8K ≥94% | CommonsenseQA ≥93% | AQuA-RAT ≥92%

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Recharts + shadcn/ui
- **Python Pipeline**: PyTorch + Transformers + PEFT + TRL + bitsandbytes
- **Inference**: FastAPI + Uvicorn

## Structure

```text
workspace/
├── artifacts/
│   ├── api-server/         # Express API (pipeline data + inference proxy)
│   └── decot-dashboard/    # React monitoring dashboard (/)
├── lib/
│   ├── api-spec/                    # OpenAPI spec + Orval codegen config
│   ├── api-client-react/            # Generated React Query hooks
│   ├── api-zod/                     # Generated Zod schemas
│   ├── db/                          # Drizzle ORM schema + DB connection
│   └── integrations-openrouter-ai/  # OpenRouter AI integration client
├── pipeline/               # Python pipeline scripts (phases 0-6)
│   ├── 00_setup.py         # Phase 0: Environment setup
│   ├── 01_download.py      # Phase 1: Dataset download
│   ├── 02_generate_cot.py  # Phase 2: GPT-4 CoT generation
│   ├── 03_filter_cot.py    # Phase 3: Quality filtering
│   ├── 04_finetune.py      # Phase 4: LoRA/QLoRA fine-tuning
│   ├── 05_evaluate.py      # Phase 5: Evaluation
│   └── 06_deploy.py        # Phase 6: FastAPI inference server
├── requirements.txt         # Python dependencies
└── README.md               # Full pipeline instructions
```

## DB Schema

Tables in PostgreSQL:
- `pipeline_status` — overall pipeline state
- `phase_status` — per-phase status (0-6), progress, timestamps
- `pipeline_logs` — timestamped log messages per phase
- `cost_tracking` — OpenAI API token/cost tracking per phase
- `evaluation_metrics` — benchmark accuracy scores
- `training_curve` — loss curve data points
- `conversations` — reasoning agent Q&A sessions (session, question, reasoning steps, answer)

## API Routes

- `GET /api/pipeline/status` — overall status
- `GET /api/pipeline/phases` — all phase statuses
- `GET /api/pipeline/logs` — log entries (filterable by phase)
- `GET /api/pipeline/cost` — cost summary
- `GET /api/evaluation/metrics` — benchmark results
- `GET /api/evaluation/training-curve` — loss curve
- `POST /api/inference/query` — run inference question
- `GET /api/inference/status` — inference service status
- `POST /api/agent/ask` — CoT reasoning agent (auto-detects math/logic/commonsense/general)
- `GET /api/agent/history` — conversation history (filterable by sessionId)
- `DELETE /api/agent/history/:sessionId` — clear a session

Internal endpoints (called by Python scripts):
- `POST /api/pipeline/internal/phase-update`
- `POST /api/pipeline/internal/cost-update`
- `POST /api/pipeline/internal/training-step`
- `POST /api/pipeline/internal/eval-metric`

## Running the Pipeline

```bash
# Install Python deps
pip install -r requirements.txt

# Run phases in order (each is resumable)
python pipeline/00_setup.py
python pipeline/01_download.py
python pipeline/02_generate_cot.py --model gpt-4o-mini
python pipeline/03_filter_cot.py
python pipeline/04_finetune.py --model meta-llama/Llama-2-7b-hf --epochs 3
python pipeline/05_evaluate.py
python pipeline/06_deploy.py
```

## Secrets Required
- `OPENAI_API_KEY` — for GPT-4 CoT generation (Phase 2)
- `HF_TOKEN` — for Llama-2-7B download from HuggingFace

## AI Integrations
- `AI_INTEGRATIONS_OPENROUTER_BASE_URL` + `AI_INTEGRATIONS_OPENROUTER_API_KEY` — auto-provisioned Replit OpenRouter proxy (used by the Reasoning Agent)

## Dashboard Features
1. **Overview** — phase cards, cost tracker, dataset counts
2. **Pipeline Monitor** — detailed phase progress table with logs
3. **Training Curves** — live Recharts loss plot (auto-refresh 30s)
4. **Evaluation Results** — accuracy vs targets bar chart
5. **Reasoning Agent** — full chat UI with CoT step-by-step reasoning (math/logic/commonsense/general), session history, confidence badges
6. **Cost Tracker** — OpenAI spend breakdown by phase
