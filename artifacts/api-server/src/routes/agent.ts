import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AgentAskBody, GetAgentHistoryResponse, ClearAgentHistoryResponse } from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import crypto from "crypto";

const router: IRouter = Router();

// gpt-4.1-mini: more capable than nano, ~same latency at low token budgets
const MODEL = "openai/gpt-4.1-mini";

// ─── Ultra-compact system prompts ────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  math:        `Math expert. Reason briefly then answer. Format:\nReason: <2-3 line working>\nFINAL ANSWER: <value>`,
  commonsense: `Common-sense expert. Briefly justify then pick. Format:\nReason: <1-2 sentences>\nFINAL ANSWER: <choice>`,
  logic:       `Logic expert. State key inference briefly. Format:\nReason: <1-2 sentences>\nFINAL ANSWER: <conclusion>`,
  general:     `Expert assistant. Be concise and precise. Format:\nReason: <2-3 sentences>\nFINAL ANSWER: <answer>`,
};

const buildPrompt = (question: string, context: string) =>
  `${context ? `Context:\n${context}\n\n` : ""}Q: ${question}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type QuestionType = "math" | "commonsense" | "logic" | "general";

function detectType(q: string): QuestionType {
  const l = q.toLowerCase();
  if (/\d[\+\-\*\/]\d|how many|calculat|percent|ratio|solve|find x|\$\d|km\/h|speed|distance|total|sum/.test(l)) return "math";
  if (/if .* then|all .* are|some .* are|therefore|implies|conclude|deduce|premise/.test(l)) return "logic";
  if (/which of|most likely|best describes|\(a\)|\(b\)|\(c\)|choices?:|options?:|where would/.test(l)) return "commonsense";
  return "general";
}

interface ParsedStep { stepNumber: number; title: string; content: string; type: string }

function parse(raw: string): { steps: ParsedStep[]; answer: string } {
  const answerMatch = raw.match(/FINAL ANSWER:\s*(.+?)(?:\n|$)/i);
  const answer = answerMatch ? answerMatch[1].trim() : raw.split("\n").pop()?.trim() ?? raw.trim();

  const reasonMatch = raw.match(/Reason:\s*([\s\S]+?)(?=FINAL ANSWER:|$)/i);
  const steps: ParsedStep[] = reasonMatch ? [{
    stepNumber: 1, title: "Reasoning", content: reasonMatch[1].trim(), type: "think"
  }] : [];

  return { steps, answer };
}

function confidence(raw: string): "high" | "medium" | "low" {
  const n = (raw.toLowerCase().match(/uncertain|not sure|might|possibly|unclear|perhaps|maybe/g) ?? []).length;
  return n === 0 ? "high" : n <= 1 ? "medium" : "low";
}

async function recentContext(sessionId: string): Promise<string> {
  const rows = await db
    .select({ question: conversationTable.question, answer: conversationTable.answer })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(1);
  if (!rows.length) return "";
  return `Prev Q: ${rows[0]!.question}\nPrev A: ${rows[0]!.answer}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/agent/ask  — SSE streaming
router.post("/ask", async (req, res) => {
  const parsed = AgentAskBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const { question, sessionId: sid, mode } = parsed.data;
  const sessionId = sid ?? crypto.randomUUID();
  const t0 = Date.now();
  const qType: QuestionType = (mode && mode !== "auto") ? mode as QuestionType : detectType(question);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const ctx = await recentContext(sessionId);
  const userPrompt = buildPrompt(question, ctx);

  let fullText = "";
  try {
    const stream = await openrouter.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[qType]! },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: 350,
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
  const conf = confidence(fullText);

  const [lastTurn] = await db
    .select({ turnNumber: conversationTable.turnNumber })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(1);
  const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;

  await db.insert(conversationTable).values({
    sessionId, turnNumber, question, answer,
    reasoning: steps, questionType: qType,
    confidence: conf, latencyMs, model: MODEL,
  });

  res.write(`data: ${JSON.stringify({
    done: true, sessionId, question, answer, reasoning: steps,
    questionType: qType, confidence: conf, latencyMs, model: MODEL, turnNumber,
  })}\n\n`);
  res.end();
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
    reasoning: (r.reasoning ?? []) as Array<{ stepNumber: number; title: string; content: string; type: string }>,
    questionType: r.questionType, confidence: r.confidence,
    latencyMs: r.latencyMs, model: r.model,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  }))));
});

// DELETE /api/agent/history/:sessionId  — clear one session
router.delete("/history/:sessionId", async (req, res) => {
  await db.delete(conversationTable).where(eq(conversationTable.sessionId, req.params.sessionId));
  return res.json(ClearAgentHistoryResponse.parse({ cleared: true, sessionId: req.params.sessionId }));
});

// DELETE /api/agent/history  — clear ALL conversations
router.delete("/history", async (_req, res) => {
  await db.delete(conversationTable);
  return res.json({ cleared: true, sessionId: "all" });
});

export default router;
