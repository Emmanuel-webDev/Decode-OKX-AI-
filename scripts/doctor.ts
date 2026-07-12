/**
 * npm run doctor — connectivity test for every configured service.
 *
 * Prints a green/red table so you know exactly what's working before you
 * try to demo, deploy, or submit to OKX.AI.
 *
 * Exits with code 1 if any REQUIRED check fails (RPC).
 * Optional checks (Gemini, Supabase, Telegram) warn but don't fail.
 */
import { createPublicClient, http } from "viem";
import { xLayer } from "../src/chain/client.js";
import { config, features } from "../src/config.js";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { Telegraf } from "telegraf";

type CheckResult = {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
  ms: number;
};

async function time<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t };
}

async function checkRpc(): Promise<CheckResult> {
  const client = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL),
  });
  try {
    const { result, ms } = await time(() => client.getBlockNumber());
    return {
      name: "X Layer RPC",
      required: true,
      ok: true,
      detail: `block ${result} @ ${config.XLAYER_RPC_URL}`,
      ms,
    };
  } catch (err) {
    return {
      name: "X Layer RPC",
      required: true,
      ok: false,
      detail: (err as Error).message.slice(0, 100),
      ms: 0,
    };
  }
}

async function checkGemini(): Promise<CheckResult> {
  if (!features.gemini) {
    return {
      name: "Gemini LLM",
      required: false,
      ok: false,
      detail: "GEMINI_API_KEY not set (heuristics fallback will be used)",
      ms: 0,
    };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });
const { result, ms } = await time(() =>
  ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: 'Reply with exactly the word "ok" and nothing else.',
  })
);
const text = (result.text ?? "").trim().toLowerCase();
    if (!text.includes("ok")) {
      return {
        name: "Gemini LLM",
        required: false,
        ok: false,
        detail: `unexpected response: ${text.slice(0, 40)}`,
        ms,
      };
    }
    return {
      name: "Gemini LLM",
      required: false,
      ok: true,
      detail: "gemini-3.5-flash responded",
      ms,
    };
  } catch (err) {
    const msg = (err as Error).message;
    const hint = msg.includes("API_KEY") ? " (bad key?)" : msg.includes("429") ? " (rate limited)" : "";
    return {
      name: "Gemini LLM",
      required: false,
      ok: false,
      detail: msg.slice(0, 80) + hint,
      ms: 0,
    };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  if (!features.supabase) {
    return {
      name: "Supabase",
      required: false,
      ok: false,
      detail: "SUPABASE_URL/KEY not set (in-memory cache will be used)",
      ms: 0,
    };
  }
  try {
    const client = createClient(
      config.SUPABASE_URL!,
      config.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    // Try a trivial read on each table to confirm they exist + RLS lets service role through
    const { ms } = await time(async () => {
      const a = await client.from("assessments").select("id").limit(1);
      if (a.error) throw new Error(`assessments table: ${a.error.message}`);
      const s = await client.from("subscribers").select("id").limit(1);
      if (s.error) throw new Error(`subscribers table: ${s.error.message}`);
    });
    return {
      name: "Supabase",
      required: false,
      ok: true,
      detail: "assessments + subscribers tables reachable",
      ms,
    };
  } catch (err) {
    const msg = (err as Error).message;
    const hint = msg.includes("does not exist")
      ? " — did you run migrations/0001_init.sql?"
      : msg.includes("Invalid API key")
      ? " — check SUPABASE_SERVICE_ROLE_KEY (must be service_role, not anon)"
      : "";
    return {
      name: "Supabase",
      required: false,
      ok: false,
      detail: msg.slice(0, 100) + hint,
      ms: 0,
    };
  }
}

async function checkTelegram(): Promise<CheckResult> {
  if (!features.telegram) {
    return {
      name: "Telegram bot",
      required: false,
      ok: false,
      detail: "TELEGRAM_BOT_TOKEN not set (alerts disabled)",
      ms: 0,
    };
  }
  try {
    const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN!);
    const { result, ms } = await time(() => bot.telegram.getMe());
    return {
      name: "Telegram bot",
      required: false,
      ok: true,
      detail: `@${result.username} (id ${result.id})`,
      ms,
    };
  } catch (err) {
    const msg = (err as Error).message;
    const hint = msg.includes("401") ? " (bad token?)" : "";
    return {
      name: "Telegram bot",
      required: false,
      ok: false,
      detail: msg.slice(0, 80) + hint,
      ms: 0,
    };
  }
}

function printTable(results: CheckResult[]) {
  const RED = "\x1b[31m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";

  console.log("");
  console.log("  ┌─ Decode Guardian: connectivity check ─────────────────────────────");
  for (const r of results) {
    const status = r.ok
      ? `${GREEN}✓${RESET}`
      : r.required
      ? `${RED}✗${RESET}`
      : `${YELLOW}○${RESET}`;
    const name = r.name.padEnd(16);
    const ms = r.ms ? `${DIM}${String(r.ms).padStart(4)}ms${RESET}` : `${DIM}   —${RESET}`;
    console.log(`  │ ${status} ${name} ${ms}  ${r.detail}`);
  }
  console.log("  └───────────────────────────────────────────────────────────────────");
  console.log("");

  const requiredFailed = results.filter((r) => r.required && !r.ok);
  const optionalFailed = results.filter((r) => !r.required && !r.ok);

  if (requiredFailed.length > 0) {
    console.log(`  ${RED}✗ ${requiredFailed.length} required check(s) failed — fix before running the app${RESET}`);
    return 1;
  }
  if (optionalFailed.length > 0) {
    console.log(
      `  ${YELLOW}○ ${optionalFailed.length} optional service(s) not configured — app will run in degraded mode${RESET}`
    );
  } else {
    console.log(`  ${GREEN}✓ All services healthy — ready to demo${RESET}`);
  }
  return 0;
}

(async () => {
  console.log("\n  Running connectivity checks...");
  const results = await Promise.all([
    checkRpc(),
    checkGemini(),
    checkSupabase(),
    checkTelegram(),
  ]);
  const code = printTable(results);
  process.exit(code);
})();
