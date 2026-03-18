import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { evaluationMetricsTable, trainingCurveTable, conversationTable } from "@workspace/db/schema";
import { desc, asc, avg, count, sql } from "drizzle-orm";
import { GetEvaluationMetricsResponse, GetTrainingCurveResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Spec targets ─────────────────────────────────────────────────────────────

const QUALITY_TARGETS = [
  { metric: "Exact Match",  key: "exactMatch",  target: 0.89, category: "accuracy" },
  { metric: "F1 Score",     key: "f1",          target: 0.94, category: "accuracy" },
  { metric: "nDCG",         key: "ndcg",        target: 0.92, category: "accuracy" },
  { metric: "BLEU",         key: "bleu",        target: 0.85, category: "language" },
  { metric: "ROUGE-L",      key: "rougeL",      target: 0.90, category: "language" },
  { metric: "METEOR",       key: "meteor",      target: 0.88, category: "language" },
  { metric: "BERTScore",    key: "bertScore",   target: 0.96, category: "language" },
];

// GET /api/evaluation/metrics
router.get("/metrics", async (_req, res) => {
  const rows = await db
    .select()
    .from(evaluationMetricsTable)
    .orderBy(desc(evaluationMetricsTable.evaluatedAt));

  const byBenchmark = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!byBenchmark.has(row.benchmark)) byBenchmark.set(row.benchmark, row);
  }

  const defaults = [
    { benchmark: "gsm8k",         accuracy: 0, targetAccuracy: 0.94, sampleCount: 0 },
    { benchmark: "commonsenseqa", accuracy: 0, targetAccuracy: 0.93, sampleCount: 0 },
    { benchmark: "aqua",          accuracy: 0, targetAccuracy: 0.92, sampleCount: 0 },
  ];

  const result = defaults.map(d => {
    const actual = byBenchmark.get(d.benchmark);
    if (actual) return {
      benchmark: actual.benchmark,
      accuracy: actual.accuracy,
      targetAccuracy: actual.targetAccuracy,
      sampleCount: actual.sampleCount,
      evaluatedAt: actual.evaluatedAt?.toISOString() ?? null,
      checkpointStep: actual.checkpointStep ?? null,
    };
    return { ...d, evaluatedAt: null, checkpointStep: null };
  });

  return res.json(GetEvaluationMetricsResponse.parse(result));
});

// GET /api/evaluation/quality  — language + accuracy quality metrics with spec targets
router.get("/quality", async (_req, res) => {
  return res.json(QUALITY_TARGETS.map(t => ({
    metric: t.metric,
    key: t.key,
    target: t.target,
    actual: null,          // populated when pipeline runs Phase 5
    category: t.category,
    status: "pending",
  })));
});

// GET /api/evaluation/performance  — live latency & throughput stats from conversations
router.get("/performance", async (_req, res) => {
  const [stats] = await db
    .select({
      totalRequests: count(),
      avgLatencyMs: avg(conversationTable.latencyMs),
      p50: sql<number>`percentile_cont(0.5) within group (order by ${conversationTable.latencyMs})`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${conversationTable.latencyMs})`,
      minLatencyMs: sql<number>`min(${conversationTable.latencyMs})`,
      maxLatencyMs: sql<number>`max(${conversationTable.latencyMs})`,
    })
    .from(conversationTable);

  // Rough throughput: requests in last 60 s
  const recentCount = await db
    .select({ n: count() })
    .from(conversationTable)
    .where(sql`${conversationTable.createdAt} > now() - interval '60 seconds'`);

  const totalRequests   = Number(stats?.totalRequests ?? 0);
  const avgLatencyMs    = stats?.avgLatencyMs != null ? Math.round(Number(stats.avgLatencyMs)) : null;
  const p50LatencyMs    = stats?.p50 != null ? Math.round(Number(stats.p50)) : null;
  const p95LatencyMs    = stats?.p95 != null ? Math.round(Number(stats.p95)) : null;
  const minLatencyMs    = stats?.minLatencyMs != null ? Math.round(Number(stats.minLatencyMs)) : null;
  const maxLatencyMs    = stats?.maxLatencyMs != null ? Math.round(Number(stats.maxLatencyMs)) : null;
  const recentRequests  = Number(recentCount[0]?.n ?? 0);

  return res.json({
    totalRequests,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    minLatencyMs,
    maxLatencyMs,
    recentRequests,
    // spec targets
    targets: {
      latencyMs: { min: 600, max: 1000 },
      throughputRps: { min: 5, max: 20 },
    },
  });
});

// GET /api/evaluation/training-curve
router.get("/training-curve", async (_req, res) => {
  const rows = await db
    .select()
    .from(trainingCurveTable)
    .orderBy(asc(trainingCurveTable.step))
    .limit(2000);

  const data = rows.map(r => ({
    step: r.step,
    loss: r.loss,
    learningRate: r.learningRate ?? null,
    timestamp: r.timestamp?.toISOString() ?? null,
  }));

  return res.json(GetTrainingCurveResponse.parse(data));
});

export default router;
