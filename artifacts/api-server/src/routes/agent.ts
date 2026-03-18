import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AgentAskBody, GetAgentHistoryResponse, ClearAgentHistoryResponse } from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import crypto from "crypto";

const router: IRouter = Router();

const MODEL = "openai/gpt-4.1-nano";

// ─── Ultra-minimal prompts ────────────────────────────────────────────────────

const SYS: Record<string, string> = {
  math:        `Solve math concisely. Show 1-2 line working. End: FINAL ANSWER: <value>`,
  commonsense: `Pick best option with 1-line justification. End: FINAL ANSWER: <choice>`,
  logic:       `Apply logic briefly. End: FINAL ANSWER: <conclusion>`,
  general:     `Answer precisely in 2-3 sentences. End: FINAL ANSWER: <answer>`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type QType = "math" | "commonsense" | "logic" | "general";

function detectType(q: string): QType {
  const l = q.toLowerCase();
  if (/\d[\+\-\*\/]\d|how many|calculat|percent|ratio|solve|find x|\$\d|km\/h|speed|distance|total/.test(l)) return "math";
  if (/if .* then|all .* are|some .* are|therefore|implies|conclude|deduce|premise/.test(l)) return "logic";
  if (/which of|most likely|best describes|\(a\)|\(b\)|\(c\)|choices?:|options?:|where would/.test(l)) return "commonsense";
  return "general";
}

interface Step { stepNumber: number; title: string; content: string; type: string }

function parse(raw: string): { steps: Step[]; answer: string } {
  const am = raw.match(/FINAL ANSWER:\s*(.+?)(?:\n|$)/i);
  const answer = am ? am[1]!.trim() : raw.trim().split("\n").pop()?.trim() ?? raw.trim();
  const rm = raw.match(/(?:Reason(?:ing)?:|^)([\s\S]+?)(?=FINAL ANSWER:|$)/i);
  const steps: Step[] = rm ? [{ stepNumber: 1, title: "Reasoning", content: rm[1]!.trim(), type: "think" }] : [];
  return { steps, answer };
}

function conf(raw: string): "high" | "medium" | "low" {
  const n = (raw.toLowerCase().match(/uncertain|not sure|might|possibly|unclear|perhaps|maybe/g) ?? []).length;
  return n === 0 ? "high" : n <= 1 ? "medium" : "low";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/agent/ask — SSE streaming, DB write is fire-and-forget
router.post("/ask", async (req, res) => {
  const parsed = AgentAskBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const { question, sessionId: sid, mode } = parsed.data;
  const sessionId = sid ?? crypto.randomUUID();
  const t0 = Date.now();
  const qType: QType = (mode && mode !== "auto") ? mode as QType : detectType(question);

  // SSE headers — flush immediately so browser starts reading
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Start LLM stream immediately — no DB pre-query to avoid latency
  let fullText = "";
  try {
    const stream = await openrouter.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYS[qType]! },
        { role: "user",   content: `Q: ${question}` },
      ],
      max_tokens: 200,
      temperature: 0.1,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullText += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
    res.end();
    return;
  }

  const latencyMs = Date.now() - t0;
  const { steps, answer } = parse(fullText);
  const confidence = conf(fullText);

  // Send done event immediately — don't wait for DB
  res.write(`data: ${JSON.stringify({
    done: true, sessionId, question, answer, reasoning: steps,
    questionType: qType, confidence, latencyMs, model: MODEL,
  })}\n\n`);
  res.end();

  // DB write in background (fire and forget)
  db.select({ turnNumber: conversationTable.turnNumber })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(1)
    .then(([last]) => db.insert(conversationTable).values({
      sessionId, turnNumber: (last?.turnNumber ?? 0) + 1,
      question, answer, reasoning: steps, questionType: qType,
      confidence, latencyMs, model: MODEL,
    }))
    .catch(console.error);
});

// GET /api/agent/history
router.get("/history", async (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const rows = sessionId
    ? await db.select().from(conversationTable).where(eq(conversationTable.sessionId, sessionId)).orderBy(desc(conversationTable.createdAt)).limit(limit)
    : await db.select().from(conversationTable).orderBy(desc(conversationTable.createdAt)).limit(limit);

  return res.json(GetAgentHistoryResponse.parse(rows.map(r => ({
    id: r.id, sessionId: r.sessionId, turnNumber: r.turnNumber,
    question: r.question, answer: r.answer,
    reasoning: (r.reasoning ?? []) as Step[],
    questionType: r.questionType, confidence: r.confidence,
    latencyMs: r.latencyMs, model: r.model,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  }))));
});

// DELETE /api/agent/history/:sessionId
router.delete("/history/:sessionId", async (req, res) => {
  await db.delete(conversationTable).where(eq(conversationTable.sessionId, req.params.sessionId));
  return res.json(ClearAgentHistoryResponse.parse({ cleared: true, sessionId: req.params.sessionId }));
});

// DELETE /api/agent/history — clear ALL
router.delete("/history", async (_req, res) => {
  await db.delete(conversationTable);
  return res.json({ cleared: true, sessionId: "all" });
});

export default router;
