import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { inspectProtocol, analyzeEvent } from "../analyzer/pipeline.js";
import { broadcastAlert } from "../telegram/bot.js";
import type { Assessment } from "../analyzer/pipeline.js";

const app = express();
app.use(express.json({ limit: "128kb" }));

// --- OpenAPI spec (kept inline; small enough) ---
const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Decode Guardian ASP",
    version: "0.1.0",
    description:
      "Autonomous X Layer security guardian. Reads recent protocol modifications (proxy upgrades, admin changes) and returns a structured risk verdict. Callable by humans, by other agents on OKX.AI, or over MCP, Try the Telegram companion bot: [@XLayerFraudGuard_bot](https://t.me/XLayerFraudGuard_bot)",
    contact: {
      name: "Decode",
      url: "https://github.com/Emmanuel-webDev/Decode-OKX-AI-",
    },
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "ok" } },
      },
    },
    "/api/v1/inspect-protocol": {
      post: {
        summary: "Inspect a proxy/pool address for recent security events",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address"],
                properties: {
                  address: {
                    type: "string",
                    example: "0xdec0de0000000000000000000000000000000001",
                    description:
                      "EVM address on X Layer. Try 0xdec0de0000000000000000000000000000000001 for a demo CRITICAL verdict, or 0xdec0de0000000000000000000000000000000002 for a demo HIGH verdict.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Assessment JSON" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/api/v1/demo-trigger": {
      post: {
        summary: "🎬 Fire a demo CRITICAL alert to all Telegram subscribers",
        description:
          "For judges + curious devs: fabricates a synthetic admin-to-EOA takeover event and broadcasts a formatted alert to every Telegram user who /watch'd the demo address. Rate-limited to 1 call per 60s per IP. See the alert land in your Telegram in ~1 second.",
        responses: {
          "200": { description: "Alert broadcast successfully" },
          "429": { description: "Rate limited — wait then retry" },
        },
      },
    },
  },
};

app.get("/health", (_, res) =>
  res.json({
    ok: true,
    chain: "xlayer",
    chainId: config.XLAYER_CHAIN_ID,
    telegram_bot: "https://t.me/XLayerFraudGuard_bot",
  }),
);

const inspectSchema = z.object({
  address: z.string().refine(isAddress, "not a valid EVM address"),
});

app.post("/api/v1/inspect-protocol", async (req, res) => {
  const parsed = inspectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await inspectProtocol(getAddress(parsed.data.address));
    res.json(result);
  } catch (err) {
    logger.error({ err }, "inspect-protocol failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// Simple in-memory rate limit: 1 call per IP per 60s
const demoTriggerLastCall = new Map<string, number>();
const DEMO_COOLDOWN_MS = 60_000;

app.post("/api/v1/demo-trigger", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const last = demoTriggerLastCall.get(ip) ?? 0;
  if (now - last < DEMO_COOLDOWN_MS) {
    const wait = Math.ceil((DEMO_COOLDOWN_MS - (now - last)) / 1000);
    return res.status(429).json({
      error: "rate_limited",
      retry_after_seconds: wait,
      note: `Demo trigger can only be called once every ${DEMO_COOLDOWN_MS / 1000}s per IP.`,
    });
  }
  demoTriggerLastCall.set(ip, now);

  // Fabricate a CRITICAL admin-to-EOA event on the demo address
  const demoAssessment: Assessment = {
    proxy: "0xdec0de0000000000000000000000000000000001",
    risk_score: 92,
    verdict: "CRITICAL",
    summary:
      "🎬 LIVE DEMO — Simulated admin-to-EOA takeover fired manually for testing. In production this would be a real X Layer proxy that just had its admin transferred to an externally owned account. Unilateral upgrade power now sits behind a single private key.",
    user_action:
      "Demo trigger — no real action needed. In a real incident, subscribed users would withdraw funds immediately.",
    signals: [
      {
        code: "ADMIN_TO_EOA",
        severity: "critical",
        message:
          "Proxy admin transferred to an EOA. No multisig or timelock protection.",
      },
    ],
    source: "gemini",
    facts_snapshot: { demo: true, triggered_at: new Date().toISOString() },
    created_at: new Date().toISOString(),
  };

  await broadcastAlert(demoAssessment);

  res.json({
    ok: true,
    message:
      "Demo alert broadcast to all subscribers of 0xdec0de0000000000000000000000000000000001. Check your Telegram if you've /watch'd this address.",
    tip: "Not receiving alerts? Message @XLayerFraudGuard_bot on Telegram, send /start, then /watch 0xdec0de0000000000000000000000000000000001",
    verdict: demoAssessment,
  });
});

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi, { customSiteTitle: "Decode Guardian API" }),
);

app.get("/", (_, res) =>
  res.json({
    name: "Decode Guardian",
    version: "0.1.0",
    docs: "/docs",
    live_service_url: "/api/v1/inspect-protocol",
    telegram_bot: "https://t.me/XLayerFraudGuard_bot",
    github: "https://github.com/Emmanuel-webDev/Decode-OKX-AI-",
  }),
);

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "🌐 API listening — docs at /docs");
  });
}

export { app };
