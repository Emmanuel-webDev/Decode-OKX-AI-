import "dotenv/config";
import { z } from "zod";

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .pipe(z.string().url().optional());

const envSchema = z.object({
  XLAYER_RPC_URL: z.string().url().default("https://rpc.xlayer.tech"),
  XLAYER_WS_URL: z.string().default("wss://rpc.xlayer.tech"),
  XLAYER_CHAIN_ID: z.coerce.number().default(196),

  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  WATCH_PROXIES: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((a) => a.trim())
        .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a))
    ),

  OUTFLOW_THRESHOLD_PCT: z.coerce.number().default(15),
  ALERT_MIN_SCORE: z.coerce.number().default(70),
});

export const config = envSchema.parse(process.env);

export const features = {
  gemini: !!config.GEMINI_API_KEY,
  supabase: !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY),
  telegram: !!config.TELEGRAM_BOT_TOKEN,
};
