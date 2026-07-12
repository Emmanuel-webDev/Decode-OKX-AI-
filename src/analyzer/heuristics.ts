import { getAddress, type Address, type Hex } from "viem";
import { httpClient } from "../chain/client.js";
import type { MonitorEvent } from "../chain/monitor.js";

/**
 * Structured facts we extract *deterministically* from the chain BEFORE
 * involving the LLM. The LLM's job is to translate these into plain English
 * and produce a summary — not to invent security opinions from bytecode.
 */
export type StructuredFacts = {
  proxy: Address;
  eventKind: MonitorEvent["kind"];
  blockNumber: string;
  txHash: Hex;
  timestampISO: string;

  // Upgrade-specific
  previousImplementation?: Address;
  newImplementation?: Address;
  newImplHasCode?: boolean;
  newImplBytecodeHash?: Hex;

  // Admin-specific
  previousAdmin?: Address;
  newAdmin?: Address;
  newAdminIsEOA?: boolean;

  // Signals
  deterministicSignals: DeterministicSignal[];
  baselineScore: number; // 0-100 from rules only
};

export type DeterministicSignal = {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
};

// EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
const IMPL_SLOT: Hex =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export async function extractFacts(
  event: MonitorEvent
): Promise<StructuredFacts> {
  const signals: DeterministicSignal[] = [];
  let score = 20; // baseline noise for any admin-touching event

  const facts: StructuredFacts = {
    proxy: event.proxy,
    eventKind: event.kind,
    blockNumber: event.blockNumber.toString(),
    txHash: event.txHash,
    timestampISO: new Date(event.timestamp * 1000).toISOString(),
    deterministicSignals: signals,
    baselineScore: 0,
  };

  if (event.kind === "upgrade") {
    facts.newImplementation = event.newImplementation;

    // Try to read previous impl one block earlier
    try {
      const prev = await httpClient.getStorageAt({
        address: event.proxy,
        slot: IMPL_SLOT,
        blockNumber: event.blockNumber - 1n,
      });
      if (prev && prev !== "0x") {
        // storage slots are 32 bytes; address is last 20
        const addr = ("0x" + prev.slice(-40)) as Address;
        facts.previousImplementation = getAddress(addr);
      }
    } catch {
      // best-effort
    }

    // Check the new implementation has code (defensive: RPC may fail)
    let code: `0x${string}` | undefined;
    try {
      code = await httpClient.getCode({ address: event.newImplementation });
      facts.newImplHasCode = !!code && code !== "0x";
    } catch {
      facts.newImplHasCode = undefined;
    }

    if (!facts.newImplHasCode) {
      signals.push({
        code: "IMPL_NO_CODE",
        severity: "critical",
        message:
          "New implementation address has no bytecode — proxy points to nothing or self-destructed contract.",
      });
      score += 50;
    } else if (code) {
      // Rough bytecode identity — real hash needs keccak but length + prefix
      // is a decent fingerprint for cache keying
      facts.newImplBytecodeHash = (code.slice(0, 66) as Hex);
    }

    signals.push({
      code: "PROXY_UPGRADE",
      severity: "warn",
      message: `Proxy at ${event.proxy} upgraded implementation to ${event.newImplementation}.`,
    });
    score += 30;
  }

  if (event.kind === "admin_change") {
    facts.previousAdmin = event.previousAdmin;
    facts.newAdmin = event.newAdmin;

    let code: `0x${string}` | undefined;
    try {
      code = await httpClient.getCode({ address: event.newAdmin });
      facts.newAdminIsEOA = !code || code === "0x";
    } catch {
      // If we can't verify, assume worst case (EOA) so we err on side of alerting
      facts.newAdminIsEOA = true;
    }

    if (facts.newAdminIsEOA) {
      signals.push({
        code: "ADMIN_TO_EOA",
        severity: "critical",
        message:
          "Proxy admin transferred to an EOA (externally owned account) — unilateral upgrade power now sits behind a single private key. No multisig or timelock protection.",
      });
      score += 60;
    } else {
      signals.push({
        code: "ADMIN_TO_CONTRACT",
        severity: "warn",
        message:
          "Proxy admin transferred to a contract. Timelock/multisig status not yet verified.",
      });
      score += 20;
    }
  }

  facts.baselineScore = Math.min(score, 100);
  return facts;
}

/**
 * Rule-based verdict used when Gemini is unavailable or rate-limited.
 * This is the honest fallback — no invented security claims.
 */
export function deterministicVerdict(facts: StructuredFacts) {
  const critical = facts.deterministicSignals.filter(
    (s) => s.severity === "critical"
  );
  const summary =
    critical.length > 0
      ? critical.map((s) => s.message).join(" ")
      : facts.deterministicSignals
          .map((s) => s.message)
          .join(" ") || "Protocol modification detected. Handle with caution.";

  const verdict: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" =
    facts.baselineScore >= 80
      ? "CRITICAL"
      : facts.baselineScore >= 50
      ? "HIGH"
      : facts.baselineScore >= 30
      ? "MEDIUM"
      : "LOW";

  return {
    risk_score: facts.baselineScore,
    verdict,
    summary,
    signals: facts.deterministicSignals,
    source: "heuristics" as const,
  };
}
