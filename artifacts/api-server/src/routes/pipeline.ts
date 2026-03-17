import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  pipelineStatusTable,
  phaseStatusTable,
  pipelineLogsTable,
  costTrackingTable,
  evaluationMetricsTable,
  trainingCurveTable,
} from "@workspace/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import {
  GetPipelineStatusResponse,
  GetPipelinePhasesResponse,
  GetPipelineLogsResponse,
  GetPipelineCostResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /api/pipeline/status
router.get("/status", async (_req, res) => {
  const rows = await db.select().from(pipelineStatusTable).limit(1);
  if (rows.length === 0) {
    return res.json(
      GetPipelineStatusResponse.parse({
        currentPhase: 0,
        overallStatus: "idle",
        startedAt: null,
        updatedAt: null,
        totalDatasetSamples: null,
        filteredCoTSamples: null,
      })
    );
  }
  const row = rows[0];
  return res.json(
    GetPipelineStatusResponse.parse({
      currentPhase: row.currentPhase,
      overallStatus: row.overallStatus,
      startedAt: row.startedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
      totalDatasetSamples: row.totalDatasetSamples,
      filteredCoTSamples: row.filteredCoTSamples,
    })
  );
});

// GET /api/pipeline/phases
router.get("/phases", async (_req, res) => {
  const rows = await db.select().from(phaseStatusTable).orderBy(asc(phaseStatusTable.phase));
  const data = rows.map((r) => ({
    phase: r.phase,
    name: r.name,
    description: r.description,
    status: r.status,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    progress: r.progress ?? null,
    errorMessage: r.errorMessage ?? null,
    metadata: r.metadata ?? null,
  }));
  return res.json(GetPipelinePhasesResponse.parse(data));
});

// GET /api/pipeline/logs
router.get("/logs", async (req, res) => {
  const phaseFilter = req.query.phase ? Number(req.query.phase) : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  let query = db
    .select()
    .from(pipelineLogsTable)
    .orderBy(desc(pipelineLogsTable.timestamp))
    .limit(limit);

  if (phaseFilter !== undefined) {
    query = db
      .select()
      .from(pipelineLogsTable)
      .where(eq(pipelineLogsTable.phase, phaseFilter))
      .orderBy(desc(pipelineLogsTable.timestamp))
      .limit(limit) as typeof query;
  }

  const rows = await query;
  const data = rows.map((r) => ({
    id: r.id,
    phase: r.phase ?? null,
    level: r.level,
    message: r.message,
    timestamp: r.timestamp?.toISOString() ?? new Date().toISOString(),
    metadata: (r.metadata as Record<string, unknown>) ?? null,
  }));
  return res.json(GetPipelineLogsResponse.parse(data));
});

// GET /api/pipeline/cost
router.get("/cost", async (_req, res) => {
  const rows = await db.select().from(costTrackingTable);

  const totalCost = rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const totalInput = rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const totalOutput = rows.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);
  const totalReqs = rows.reduce((sum, r) => sum + (r.requestCount ?? 0), 0);

  const costByPhase = rows.map((r) => ({
    phase: r.phase,
    costUsd: r.costUsd ?? 0,
    requestCount: r.requestCount ?? 0,
  }));

  const BUDGET = 120;
  const estimatedRemaining = totalCost > 0 ? Math.max(0, BUDGET - totalCost) : null;

  return res.json(
    GetPipelineCostResponse.parse({
      totalCostUsd: totalCost,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      requestCount: totalReqs,
      costByPhase,
      estimatedRemainingUsd: estimatedRemaining,
    })
  );
});

// ─── Internal endpoints (called by Python scripts) ─────────────────────────

// POST /api/pipeline/internal/phase-update
router.post("/internal/phase-update", async (req, res) => {
  const { phase, status, message, progress, metadata } = req.body as {
    phase: number;
    status: string;
    message: string;
    progress?: number;
    metadata?: Record<string, unknown>;
  };

  const PHASE_NAMES: Record<number, { name: string; description: string }> = {
    0: { name: "Environment Setup", description: "Install dependencies, validate secrets" },
    1: { name: "Dataset Download", description: "Fetch GSM8K, CommonsenseQA, AQuA-RAT" },
    2: { name: "CoT Generation", description: "Generate chain-of-thought with GPT-4" },
    3: { name: "Filtering & Quality", description: "Filter and validate CoT traces" },
    4: { name: "LoRA Fine-tuning", description: "Train Llama-2-7B with QLoRA" },
    5: { name: "Evaluation", description: "Benchmark accuracy on GSM8K, CSQA, AQuA" },
    6: { name: "Deploy & Serve", description: "FastAPI inference server" },
  };

  const phaseInfo = PHASE_NAMES[phase] ?? { name: `Phase ${phase}`, description: "" };

  // Upsert phase status
  await db
    .insert(phaseStatusTable)
    .values({
      phase,
      name: phaseInfo.name,
      description: phaseInfo.description,
      status,
      startedAt: status === "running" ? new Date() : undefined,
      completedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      progress: progress ?? null,
      metadata: (metadata as Record<string, unknown>) ?? null,
    })
    .onConflictDoUpdate({
      target: phaseStatusTable.phase,
      set: {
        status,
        progress: progress ?? sql`phase_status.progress`,
        completedAt: status === "completed" || status === "failed" ? new Date() : sql`phase_status.completed_at`,
        metadata: (metadata as Record<string, unknown>) ?? sql`phase_status.metadata`,
      },
    });

  // Log message
  if (message) {
    await db.insert(pipelineLogsTable).values({
      phase,
      level: status === "failed" ? "error" : "info",
      message,
      metadata: metadata ? (metadata as Record<string, unknown>) : null,
    });
  }

  // Update overall pipeline status
  const statusRows = await db.select().from(pipelineStatusTable).limit(1);
  if (statusRows.length === 0) {
    await db.insert(pipelineStatusTable).values({
      currentPhase: phase,
      overallStatus: status === "running" ? "running" : "idle",
      startedAt: new Date(),
    });
  } else {
    await db
      .update(pipelineStatusTable)
      .set({
        currentPhase: phase,
        overallStatus: status === "running" ? "running" : status === "failed" ? "failed" : "running",
        updatedAt: new Date(),
      })
      .where(eq(pipelineStatusTable.id, statusRows[0].id));
  }

  return res.json({ ok: true });
});

// POST /api/pipeline/internal/cost-update
router.post("/internal/cost-update", async (req, res) => {
  const { phase, inputTokens, outputTokens, costUsd, requestCount } = req.body as {
    phase: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    requestCount: number;
  };

  await db
    .insert(costTrackingTable)
    .values({ phase, inputTokens, outputTokens, costUsd, requestCount })
    .onConflictDoUpdate({
      target: costTrackingTable.phase,
      set: {
        inputTokens,
        outputTokens,
        costUsd,
        requestCount,
        updatedAt: new Date(),
      },
    });

  return res.json({ ok: true });
});

// POST /api/pipeline/internal/training-step
router.post("/internal/training-step", async (req, res) => {
  const { step, loss, learningRate } = req.body as {
    step: number;
    loss: number;
    learningRate?: number;
  };

  await db.insert(trainingCurveTable).values({
    step,
    loss,
    learningRate: learningRate ?? null,
  });

  return res.json({ ok: true });
});

// POST /api/pipeline/internal/eval-metric
router.post("/internal/eval-metric", async (req, res) => {
  const { benchmark, accuracy, targetAccuracy, sampleCount, checkpointStep } = req.body as {
    benchmark: string;
    accuracy: number;
    targetAccuracy: number;
    sampleCount: number;
    checkpointStep?: number;
  };

  await db.insert(evaluationMetricsTable).values({
    benchmark,
    accuracy,
    targetAccuracy,
    sampleCount,
    checkpointStep: checkpointStep ?? null,
  });

  return res.json({ ok: true });
});

export default router;
