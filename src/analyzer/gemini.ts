import { GoogleGenAI } from "@google/genai";
import { config, features } from "../config.js";
import { logger } from "../logger.js";
import type { StructuredFacts } from "./heuristics.js";

const SYSTEM_INSTRUCTION = `You are Decode, a security-explanation agent for X Layer protocols.
You receive STRUCTURED FACTS extracted deterministically from the chain by another module. You NEVER invent security claims beyond what the facts state.

Your job:
1. Explain the facts in plain English (2-3 sentences).
2. Assess a risk_score 0-100, weighted mostly by the deterministic signals provided.
3. Return STRICT JSON matching the requested schema. No prose outside the JSON.

Rules:
- If a "critical" signal is present, verdict must be HIGH or CRITICAL.
- Never claim to have analyzed bytecode you have not been shown.
- Never invent function names, admin identities, or exploit vectors that are not in the facts.
- If facts are sparse, say so and score conservatively.`;

export type LlmVerdict = {
  risk_score: number;
  verdict: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  user_action: string;
  source: "gemini";
};

let client: GoogleGenAI | null = null;
function getClient() {
  if (!features.gemini) return null;
  if (!client) client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });
  return client;
}

export async function llmAnalyze(
  facts: StructuredFacts
): Promise<LlmVerdict | null> {
  const ai = getClient();
  if (!ai) return null;

  const factBlock = JSON.stringify(
    {
      event_kind: facts.eventKind,
      proxy: facts.proxy,
      block: facts.blockNumber,
      tx: facts.txHash,
      time: facts.timestampISO,
      previous_implementation: facts.previousImplementation ?? null,
      new_implementation: facts.newImplementation ?? null,
      new_impl_has_code: facts.newImplHasCode ?? null,
      previous_admin: facts.previousAdmin ?? null,
      new_admin: facts.newAdmin ?? null,
      new_admin_is_eoa: facts.newAdminIsEOA ?? null,
      deterministic_signals: facts.deterministicSignals,
      rule_based_baseline_score: facts.baselineScore,
    },
    null,
    2
  );

  try {
    const timeoutMs = 20_000;
    const result = await Promise.race([
      ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `STRUCTURED FACTS:\n${factBlock}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("gemini_timeout")), timeoutMs)
      ),
    ]);

    const text = result.text ?? "";
    logger.info({ raw : text }, "Gemini raw response");
    const cleaned = text
    .replace(/^`(?:json)?\s*/i, "")
    .replace(/\s*\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    const summary = parsed.summary ?? parsed.explanation ?? parsed.analysis ?? "";
    const userAction = parsed.user_action ?? parsed.userAction ?? parsed.action ?? "Monitor position; consider withdrawing if unsure.";
    if (
  typeof parsed.risk_score !== "number" ||
  typeof summary !== "string" ||
  summary.length === 0 ||
  !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.verdict)
) {
  logger.warn({ parsed }, "Gemini response shape mismatch");
  throw new Error("gemini_bad_shape");
}
   return {
  risk_score: Math.max(0, Math.min(100, Math.round(parsed.risk_score))),
  verdict: parsed.verdict,
  summary,
  user_action: userAction,
  source: "gemini",
};
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "Gemini call failed — falling back to heuristics"
    );
    return null;
  }
}
