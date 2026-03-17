import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AgentAskBody, GetAgentHistoryResponse, ClearAgentHistoryResponse } from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import crypto from "crypto";

const router: IRouter = Router();

const MODEL = "openai/gpt-4.1-nano";

// ─── Compact system prompts ────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  math: `Expert math solver. Work step-by-step. End with: FINAL ANSWER: <value>`,
  commonsense: `Expert common-sense reasoner. Eliminate wrong options, pick the best. End with: FINAL ANSWER: <answer>`,
  logic: `Expert logician. Apply formal reasoning. End with: FINAL ANSWER: <conclusion>`,
  general: `Expert reasoning agent. Break down the question and answer precisely. End with: FINAL ANSWER: <answer>`,
};

const buildPrompt = (question: string, context: string) =>
  `${context ? context + "\n---\n" : ""}Q: ${question}

STEP 1 — Setup: [identify key info and what to solve]
STEP 2 — Reason: [work through the problem]
STEP 3 — Verify: [check the answer]
STEP 4 — Conclude: [synthesize]

FINAL ANSWER: [concise answer only]`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type QuestionType = "math" | "commonsense" | "logic" | "general";

function detectQuestionType(question: string): QuestionType {
  const q = question.toLowerCase();
  if (/\d+\s*[\+\-\*\/\^]\s*\d+|how many|calculate|percent|ratio|solve for|find x|total|sum|difference|product|\$\d/.test(q)) return "math";
  if (/if .* then|all .* are|some .* are|therefore|implies|conclude|deduce|premise|contradiction/.test(q)) return "logic";
  if (/where would|which of the following|most likely|best describes|\(a\)|\(b\)|\(c\)|choices?:|options?:/.test(q)) return "commonsense";
  return "general";
}

type ReasoningStepType = "classify" | "think" | "calculate" | "verify" | "conclude";

interface ParsedStep {
  stepNumber: number;
  title: string;
  content: string;
  type: ReasoningStepType;
}

const STEP_TYPES: ReasoningStepType[] = ["classify", "think", "calculate", "conclude"];

function parseReasoningSteps(raw: string): { steps: ParsedStep[]; answer: string } {
  const steps: ParsedStep[] = [];

  const stepRe = /STEP\s*(\d+)\s*[—\-–:]\s*([^\n:]+)[:\s]*\n?([\s\S]*?)(?=STEP\s*\d+\s*[—\-–:]|FINAL ANSWER:|$)/gi;
  let m;
  while ((m = stepRe.exec(raw)) !== null) {
    const num = parseInt(m[1]) - 1;
    steps.push({
      stepNumber: parseInt(m[1]),
      title: m[2].replace(/[\[\]]/g, "").trim(),
      content: m[3].replace(/[\[\]]/g, "").trim(),
      type: STEP_TYPES[Math.min(num, STEP_TYPES.length - 1)] ?? "think",
    });
  }

  if (steps.length === 0) {
    raw.split("\n").filter(l => l.trim().length > 15).slice(0, 4).forEach((l, i) => {
      steps.push({ stepNumber: i + 1, title: `Step ${i + 1}`, content: l.trim(), type: STEP_TYPES[i] ?? "think" });
    });
  }

  const answerMatch = raw.match(/FINAL ANSWER:\s*(.+?)(?:\n|$)/i);
  const answer = answerMatch ? answerMatch[1].trim() : raw.trim().split("\n").pop()?.trim() ?? raw.trim();

  return { steps, answer };
}

function assessConfidence(raw: string): "high" | "medium" | "low" {
  const uncertain = raw.toLowerCase().match(/uncertain|not sure|might be|possibly|unclear|perhaps|maybe/g)?.length ?? 0;
  return uncertain === 0 ? "high" : uncertain <= 1 ? "medium" : "low";
}

async function buildContext(sessionId: string): Promise<string> {
  const history = await db
    .select({ question: conversationTable.question, answer: conversationTable.answer })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(2);
  if (!history.length) return "";
  return history.reverse().map(t => `Prev Q: ${t.question}\nPrev A: ${t.answer}`).join("\n");
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/agent/ask — streaming SSE endpoint
router.post("/ask", async (req, res) => {
  const parsed = AgentAskBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", detail: parsed.error.message });
  }

  const { question, sessionId: incomingSession, mode } = parsed.data;
  const sessionId = incomingSession ?? crypto.randomUUID();
  const t0 = Date.now();

  const questionType: QuestionType =
    mode && mode !== "auto" ? (mode as QuestionType) : detectQuestionType(question);

  // SSE headers — client sees tokens as they arrive
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const context = await buildContext(sessionId);
  const userPrompt = buildPrompt(question, context);

  let fullText = "";
  try {
    const stream = await openrouter.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[questionType] },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.15,
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
  const { steps, answer } = parseReasoningSteps(fullText);
  const confidence = assessConfidence(fullText);

  // Get turn number
  const [lastTurn] = await db
    .select({ turnNumber: conversationTable.turnNumber })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(1);
  const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;

  await db.insert(conversationTable).values({
    sessionId, turnNumber, question, answer,
    reasoning: steps, questionType, confidence, latencyMs, model: MODEL,
  });

  res.write(`data: ${JSON.stringify({
    done: true,
    sessionId, question, answer, reasoning: steps,
    questionType, confidence, latencyMs, model: MODEL, turnNumber,
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

  const data = rows.map(r => ({
    id: r.id,
    sessionId: r.sessionId,
    turnNumber: r.turnNumber,
    question: r.question,
    answer: r.answer,
    reasoning: r.reasoning as Array<{ stepNumber: number; title: string; content: string; type: string }>,
    questionType: r.questionType,
    confidence: r.confidence,
    latencyMs: r.latencyMs,
    model: r.model,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

  return res.json(GetAgentHistoryResponse.parse(data));
});

// DELETE /api/agent/history/:sessionId
router.delete("/history/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  await db.delete(conversationTable).where(eq(conversationTable.sessionId, sessionId));
  return res.json(ClearAgentHistoryResponse.parse({ cleared: true, sessionId }));
});

export default router;
