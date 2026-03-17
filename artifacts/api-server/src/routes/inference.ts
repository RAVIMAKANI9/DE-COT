import { Router, type IRouter } from "express";
import { InferenceQueryBody, InferenceQueryResponse, GetInferenceStatusResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory inference state (would connect to the Python FastAPI service in production)
const INFERENCE_SERVICE_URL = process.env["INFERENCE_SERVICE_URL"] ?? "http://localhost:8000";

async function callInferenceService(question: string, benchmark?: string | null): Promise<{
  answer: string;
  latencyMs: number;
  modelLoaded: boolean;
  usedFallback: boolean;
}> {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${INFERENCE_SERVICE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, benchmark }),
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok) {
      const data = await resp.json() as { answer: string; latencyMs: number; modelLoaded: boolean; usedFallback: boolean };
      return data;
    }
  } catch {
    // Fall through to GPT fallback
  }

  // GPT-4o-mini fallback via OpenAI
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Answer this question concisely. Give only the final answer.\n\nQuestion: ${question}\n\nAnswer:`,
            },
          ],
          max_tokens: 64,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
        return {
          answer: data.choices[0]?.message?.content?.trim() ?? "Unable to answer",
          latencyMs: Date.now() - t0,
          modelLoaded: false,
          usedFallback: true,
        };
      }
    } catch {
      // Fall through
    }
  }

  return {
    answer: "Inference service unavailable. Please run Phase 4 & 6 first.",
    latencyMs: Date.now() - t0,
    modelLoaded: false,
    usedFallback: true,
  };
}

// POST /api/inference/query
router.post("/query", async (req, res) => {
  const parsed = InferenceQueryBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", detail: parsed.error.message });
  }

  const { question, benchmark } = parsed.data;
  const result = await callInferenceService(question, benchmark);

  return res.json(InferenceQueryResponse.parse(result));
});

// GET /api/inference/status
router.get("/status", async (_req, res) => {
  try {
    const resp = await fetch(`${INFERENCE_SERVICE_URL}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      const data = await resp.json() as {
        modelLoaded: boolean;
        adapterPath?: string;
        baseModel?: string;
        deviceMap?: string;
        readyForInference: boolean;
      };
      return res.json(GetInferenceStatusResponse.parse({
        modelLoaded: data.modelLoaded ?? false,
        adapterPath: data.adapterPath ?? null,
        baseModel: data.baseModel ?? null,
        deviceMap: data.deviceMap ?? null,
        readyForInference: data.readyForInference ?? false,
      }));
    }
  } catch {
    // Service not running
  }

  return res.json(
    GetInferenceStatusResponse.parse({
      modelLoaded: false,
      adapterPath: null,
      baseModel: null,
      deviceMap: null,
      readyForInference: false,
    })
  );
});

export default router;
