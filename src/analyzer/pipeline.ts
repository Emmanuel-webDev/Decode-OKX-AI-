import type { Address } from "viem";
import type { MonitorEvent } from "../chain/monitor.js";
import { extractFacts, deterministicVerdict } from "./heuristics.js";
import { llmAnalyze, type LlmVerdict } from "./gemini.js";
import { cache } from "../cache/supabase.js";
import { logger } from "../logger.js";

export type Assessment = {
  proxy: Address;
  risk_score: number;
  verdict: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  user_action?: string;
  signals: { code: string; severity: string; message: string }[];
  source: "gemini" | "heuristics" | "cache";
  facts_snapshot: Record<string, unknown>;
  created_at: string;
};

export async function analyzeEvent(event: MonitorEvent): Promise<Assessment> {
  const cacheKey = `${event.kind}:${event.proxy}:${event.txHash}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info({ key: cacheKey }, "Cache hit");
    return { ...cached, source: "cache" as const };
  }

  const facts = await extractFacts(event);
  const llm = await llmAnalyze(facts);

  const verdict: LlmVerdict | ReturnType<typeof deterministicVerdict> =
    llm ?? deterministicVerdict(facts);

  const assessment: Assessment = {
    proxy: event.proxy,
    risk_score: verdict.risk_score,
    verdict: verdict.verdict,
    summary: verdict.summary,
    user_action: "user_action" in verdict ? verdict.user_action : undefined,
    signals: facts.deterministicSignals,
    source: verdict.source,
    facts_snapshot: facts as unknown as Record<string, unknown>,
    created_at: new Date().toISOString(),
  };

  await cache.set(cacheKey, assessment).catch((err) =>
    logger.warn({ err }, "Cache write failed")
  );
  return assessment;
}

/**
 * Used by the MCP `inspect_protocol_safety` tool: given a pool/proxy address,
 * return the most recent cached assessment, or a "no recent activity" reply.
 */
export async function inspectProtocol(
  address: Address
): Promise<
  | Assessment
  | {
      proxy: Address;
      verdict: "UNKNOWN";
      summary: string;
      risk_score: number;
      note: string;
      demo_addresses: { critical: string; high: string };
    }
> {
  const latest = await cache.latestByProxy(address);
  if (latest) return { ...latest, source: "cache" };
  return {
    proxy: address,
    verdict: "UNKNOWN",
    risk_score: 0,
    summary:
      "No recent security events observed for this address by the Decode monitor. This does NOT constitute an audit — treat as informational.",
    note: "Decode is a reactive monitor. UNKNOWN means no admin changes or proxy upgrades have been captured for this address in the current monitor window. To see a populated verdict, try one of the demo addresses below — they contain synthetic assessments illustrating what a real incident would look like.",
    demo_addresses: {
      critical: "0xdec0de0000000000000000000000000000000001",
      high: "0xdec0de0000000000000000000000000000000002",
    },
  };
}
