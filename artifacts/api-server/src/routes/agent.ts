import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AgentAskBody, AgentAskResponse, GetAgentHistoryResponse, ClearAgentHistoryResponse } from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import crypto from "crypto";

const router: IRouter = Router();

const MODEL = "openai/gpt-4o-mini";

// ─── Reasoning Strategies ────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  math: `You are an expert mathematical reasoning agent. Your role is to solve math problems with precise, step-by-step working.

Rules:
- Show every step of your calculation
- Label operations clearly (e.g., "Addition:", "Substitution:", "Simplification:")
- Double-check your arithmetic at the end
- State the final numerical answer clearly at the end as: FINAL ANSWER: <value>`,

  commonsense: `You are an expert common-sense reasoning agent. You answer questions about everyday situations and multiple-choice questions.

Rules:
- Reason through each option methodically
- Draw on real-world knowledge and logic
- Eliminate implausible options first
- State your final answer clearly at the end as: FINAL ANSWER: <answer>`,

  logic: `You are an expert logical reasoning agent. You solve deduction, inference, and argument analysis problems.

Rules:
- Identify all given premises
- Apply logical rules formally (modus ponens, syllogism, etc.)
- Check for hidden assumptions
- State your final conclusion as: FINAL ANSWER: <conclusion>`,

  general: `You are an expert reasoning agent. Answer questions thoughtfully and accurately.

Rules:
- Break down the question into parts
- Consider multiple perspectives when relevant
- Cite specific reasoning for each claim
- State your final answer clearly as: FINAL ANSWER: <answer>`,
};

const COT_PROMPT = (questionType: string, question: string, conversationContext: string) => `${conversationContext}

Question: ${question}

Think through this step by step. Use this format EXACTLY:

STEP 1 — Classify & Set Up:
[Identify question type, key information, what needs to be solved]

STEP 2 — Reason:
[Apply relevant knowledge, work through the problem]

STEP 3 — Calculate/Verify:
[Show any calculations, check your logic]

STEP 4 — Conclusion:
[Synthesize your reasoning into a clear answer]

FINAL ANSWER: [concise answer only]`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type QuestionType = "math" | "commonsense" | "logic" | "general";

function detectQuestionType(question: string): QuestionType {
  const q = question.toLowerCase();

  const mathPatterns = [
    /\d+\s*[\+\-\*\/\^]\s*\d+/, /how many/, /calculate/, /what is \d/, /\$\d/,
    /percent/, /ratio/, /total/, /sum|difference|product|quotient/, /algebra/,
    /equation/, /solve for/, /find x/, /if .* and .* how/,
  ];
  if (mathPatterns.some(p => p.test(q))) return "math";

  const logicPatterns = [
    /if .* then/, /all .* are/, /some .* are/, /none .* are/, /therefore/,
    /implies/, /conclude/, /deduce/, /valid.*argument/, /premise/,
    /true.*false|false.*true/, /contradiction/,
  ];
  if (logicPatterns.some(p => p.test(q))) return "logic";

  const commonsensePatterns = [
    /where would you/, /which of the following/, /what would happen if/,
    /most likely/, /best describes/, /common.*sense/, /everyday/, /typically/,
    /\(a\)|\(b\)|\(c\)|\(d\)|\(e\)/, /choices?:/i, /options?:/i,
  ];
  if (commonsensePatterns.some(p => p.test(q))) return "commonsense";

  return "general";
}

type ReasoningStepType = "classify" | "think" | "calculate" | "verify" | "conclude";

interface ParsedStep {
  stepNumber: number;
  title: string;
  content: string;
  type: ReasoningStepType;
}

function parseReasoningSteps(rawText: string): { steps: ParsedStep[]; answer: string } {
  const stepTypes: Array<{ pattern: RegExp; type: ReasoningStepType }> = [
    { pattern: /STEP\s*1/i, type: "classify" },
    { pattern: /STEP\s*2/i, type: "think" },
    { pattern: /STEP\s*3/i, type: "calculate" },
    { pattern: /STEP\s*4/i, type: "conclude" },
  ];

  const steps: ParsedStep[] = [];

  // Split by STEP markers
  const stepRegex = /STEP\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=STEP\s*\d+\s*[—\-–:]|FINAL ANSWER:|$)/gi;
  let match;
  while ((match = stepRegex.exec(rawText)) !== null) {
    const num = parseInt(match[1]);
    const title = match[2].trim();
    const content = match[3].trim();
    const typeEntry = stepTypes.find(s => s.pattern.test(`STEP ${num}`));
    steps.push({
      stepNumber: num,
      title,
      content,
      type: typeEntry?.type ?? "think",
    });
  }

  // Fallback: if no steps found, split by newlines into meaningful chunks
  if (steps.length === 0) {
    const lines = rawText.split("\n").filter(l => l.trim().length > 20);
    lines.slice(0, 4).forEach((line, i) => {
      steps.push({ stepNumber: i + 1, title: `Reasoning ${i + 1}`, content: line.trim(), type: "think" });
    });
  }

  // Extract final answer
  const answerMatch = rawText.match(/FINAL ANSWER:\s*(.+?)(?:\n|$)/i);
  const answer = answerMatch ? answerMatch[1].trim() : rawText.split("\n").pop()?.trim() ?? rawText.trim();

  return { steps, answer };
}

function assessConfidence(steps: ParsedStep[], rawText: string): "high" | "medium" | "low" {
  const uncertaintyMarkers = ["uncertain", "not sure", "might be", "possibly", "unclear", "i think", "perhaps", "maybe"];
  const text = rawText.toLowerCase();
  const uncertainCount = uncertaintyMarkers.filter(m => text.includes(m)).length;

  if (uncertainCount === 0 && steps.length >= 3) return "high";
  if (uncertainCount <= 1) return "medium";
  return "low";
}

async function buildConversationContext(sessionId: string): Promise<string> {
  const history = await db
    .select()
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(3);

  if (history.length === 0) return "";

  const ctx = history
    .reverse()
    .map(t => `Previous Q: ${t.question}\nPrevious A: ${t.answer}`)
    .join("\n\n");

  return `CONVERSATION CONTEXT (for reference):\n${ctx}\n\n---`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/agent/ask
router.post("/ask", async (req, res) => {
  const parsed = AgentAskBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", detail: parsed.error.message });
  }

  const { question, sessionId: incomingSession, mode } = parsed.data;
  const sessionId = incomingSession ?? crypto.randomUUID();

  const t0 = Date.now();

  // Detect question type
  const questionType: QuestionType = (mode && mode !== "auto") ? (mode as QuestionType) : detectQuestionType(question);

  // Get conversation history for context
  const conversationContext = await buildConversationContext(sessionId);

  // Get turn number
  const lastTurn = await db
    .select({ turnNumber: conversationTable.turnNumber })
    .from(conversationTable)
    .where(eq(conversationTable.sessionId, sessionId))
    .orderBy(desc(conversationTable.turnNumber))
    .limit(1);
  const turnNumber = (lastTurn[0]?.turnNumber ?? 0) + 1;

  // Build the CoT prompt
  const userPrompt = COT_PROMPT(questionType, question, conversationContext);
  const systemPrompt = SYSTEM_PROMPTS[questionType];

  // Call LLM via OpenRouter
  let rawResponse = "";
  try {
    const completion = await openrouter.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 8192,
      temperature: 0.2,
    });
    rawResponse = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    return res.status(502).json({ error: "Failed to reach LLM", detail: String(e) });
  }

  const latencyMs = Date.now() - t0;

  // Parse steps and answer
  const { steps, answer } = parseReasoningSteps(rawResponse);
  const confidence = assessConfidence(steps, rawResponse);

  // Persist to DB
  await db.insert(conversationTable).values({
    sessionId,
    turnNumber,
    question,
    answer,
    reasoning: steps,
    questionType,
    confidence,
    latencyMs,
    model: MODEL,
  });

  return res.json(
    AgentAskResponse.parse({
      sessionId,
      question,
      answer,
      reasoning: steps,
      questionType,
      confidence,
      latencyMs,
      model: MODEL,
      turnNumber,
    })
  );
});

// GET /api/agent/history
router.get("/history", async (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let rows;
  if (sessionId) {
    rows = await db
      .select()
      .from(conversationTable)
      .where(eq(conversationTable.sessionId, sessionId))
      .orderBy(desc(conversationTable.createdAt))
      .limit(limit);
  } else {
    rows = await db
      .select()
      .from(conversationTable)
      .orderBy(desc(conversationTable.createdAt))
      .limit(limit);
  }

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
