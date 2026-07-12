/**
 * npm run seed — insert demo assessments into Supabase so judges see
 * populated verdicts when they poke the /inspect-protocol endpoint.
 *
 * Idempotent: uses upsert on cache_key, so re-running just refreshes the rows.
 */
import { createClient } from "@supabase/supabase-js";
import { config, features } from "../src/config.js";
import { logger } from "../src/logger.js";

const DEMO_CRITICAL = "0xdec0de0000000000000000000000000000000001";
const DEMO_HIGH = "0xdec0de0000000000000000000000000000000002";

const now = new Date().toISOString();

const criticalAssessment = {
  proxy: DEMO_CRITICAL,
  risk_score: 92,
  verdict: "CRITICAL" as const,
  summary:
    "DEMO ROW — Proxy admin was transferred to an externally owned account (EOA). Unilateral upgrade power now sits behind a single private key with no multisig or timelock. Any compromise of that key would allow immediate replacement of the implementation and drainage of user funds.",
  user_action:
    "Withdraw funds from this protocol until admin is restored to a multisig or timelock-protected contract.",
  signals: [
    {
      code: "ADMIN_TO_EOA",
      severity: "critical",
      message: "Proxy admin transferred to an EOA. No multisig or timelock protection.",
    },
    {
      code: "PROXY_UPGRADE",
      severity: "warn",
      message: "Implementation address changed within the same block as admin transfer.",
    },
  ],
  source: "demo",
  facts_snapshot: {
    proxy: DEMO_CRITICAL,
    eventKind: "admin_change",
    blockNumber: "8234567",
    txHash: "0xdec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0",
    timestampISO: now,
    previousAdmin: "0x000000000000000000000000000000000000dead",
    newAdmin: "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
    newAdminIsEOA: true,
    baselineScore: 80,
  },
  created_at: now,
};

const highAssessment = {
  proxy: DEMO_HIGH,
  risk_score: 74,
  verdict: "HIGH" as const,
  summary:
    "DEMO ROW — Proxy was upgraded to a new implementation contract that currently has no bytecode. Users interacting with the proxy will hit a contract that cannot execute, which is either a botched upgrade or a deliberate freeze of protocol functionality.",
  user_action:
    "Do not send new transactions to this proxy until the implementation is verified. Existing positions may be temporarily inaccessible.",
  signals: [
    {
      code: "PROXY_UPGRADE",
      severity: "warn",
      message: "Implementation address changed.",
    },
    {
      code: "IMPL_NO_CODE",
      severity: "critical",
      message: "New implementation address has no bytecode.",
    },
  ],
  source: "demo",
  facts_snapshot: {
    proxy: DEMO_HIGH,
    eventKind: "upgrade",
    blockNumber: "8234580",
    txHash: "0xdec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec0dedec1",
    timestampISO: now,
    previousImplementation: "0x1111111111111111111111111111111111111111",
    newImplementation: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    newImplHasCode: false,
    baselineScore: 70,
  },
  created_at: now,
};

const rows = [
  {
    cache_key: `demo:${DEMO_CRITICAL}`,
    proxy: DEMO_CRITICAL.toLowerCase(),
    payload: criticalAssessment,
  },
  {
    cache_key: `demo:${DEMO_HIGH}`,
    proxy: DEMO_HIGH.toLowerCase(),
    payload: highAssessment,
  },
];

(async () => {
  if (!features.supabase) {
    logger.error("Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running seed.");
    process.exit(1);
  }

  const client = createClient(
    config.SUPABASE_URL!,
    config.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  logger.info({ count: rows.length }, "Seeding demo assessments...");

  const { error } = await client
    .from("assessments")
    .upsert(rows, { onConflict: "cache_key" });

  if (error) {
    logger.error({ err: error.message }, "Seed failed");
    process.exit(1);
  }
  logger.info({ critical: DEMO_CRITICAL, high: DEMO_HIGH }, "✓ Demo rows seeded. Try:");
  console.log("");
  console.log(`  curl -X POST http://localhost:${config.PORT}/api/v1/inspect-protocol \\`);
  console.log(`-H "Content-Type: application/json" \\`    );
  console.log(`    -d '{"address":"${DEMO_CRITICAL}"}'`);
  console.log("");
  process.exit(0);
})();