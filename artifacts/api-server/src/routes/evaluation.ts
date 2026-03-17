import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { evaluationMetricsTable, trainingCurveTable } from "@workspace/db/schema";
import { desc, asc } from "drizzle-orm";
import { GetEvaluationMetricsResponse, GetTrainingCurveResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /api/evaluation/metrics
router.get("/metrics", async (_req, res) => {
  const rows = await db
    .select()
    .from(evaluationMetricsTable)
    .orderBy(desc(evaluationMetricsTable.evaluatedAt));

  // Return latest per benchmark
  const byBenchmark = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!byBenchmark.has(row.benchmark)) {
      byBenchmark.set(row.benchmark, row);
    }
  }

  // Seed defaults if empty
  const defaults = [
    { benchmark: "gsm8k", accuracy: 0, targetAccuracy: 0.94, sampleCount: 0 },
    { benchmark: "commonsenseqa", accuracy: 0, targetAccuracy: 0.93, sampleCount: 0 },
    { benchmark: "aqua", accuracy: 0, targetAccuracy: 0.92, sampleCount: 0 },
  ];

  const result = defaults.map((d) => {
    const actual = byBenchmark.get(d.benchmark);
    if (actual) {
      return {
        benchmark: actual.benchmark,
        accuracy: actual.accuracy,
        targetAccuracy: actual.targetAccuracy,
        sampleCount: actual.sampleCount,
        evaluatedAt: actual.evaluatedAt?.toISOString() ?? null,
        checkpointStep: actual.checkpointStep ?? null,
      };
    }
    return { ...d, evaluatedAt: null, checkpointStep: null };
  });

  return res.json(GetEvaluationMetricsResponse.parse(result));
});

// GET /api/evaluation/training-curve
router.get("/training-curve", async (_req, res) => {
  const rows = await db
    .select()
    .from(trainingCurveTable)
    .orderBy(asc(trainingCurveTable.step))
    .limit(2000);

  const data = rows.map((r) => ({
    step: r.step,
    loss: r.loss,
    learningRate: r.learningRate ?? null,
    timestamp: r.timestamp?.toISOString() ?? null,
  }));

  return res.json(GetTrainingCurveResponse.parse(data));
});

export default router;
