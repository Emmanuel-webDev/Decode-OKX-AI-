import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { inspectProtocol, analyzeEvent } from "../analyzer/pipeline.js";

const app = express();
app.use(express.json({ limit: "128kb" }));

// --- OpenAPI spec (kept inline; small enough) ---
const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Decode Guardian ASP",
    version: "0.1.0",
    description:
      "Autonomous X Layer security guardian. Reads recent protocol modifications (proxy upgrades, admin changes) and returns a structured risk verdict. Callable by humans, by other agents on OKX.AI, or over MCP.",
    contact: { name: "Decode", url: "https://github.com/your-handle/decode-guardian" },
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
                    example: "0x0000000000000000000000000000000000000000",
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
  },
};

app.get("/health", (_, res) => res.json({ ok: true, chain: "xlayer", chainId: config.XLAYER_CHAIN_ID }));

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

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi, { customSiteTitle: "Decode Guardian API" })
);

app.get("/", (_, res) =>
  res.json({
    name: "Decode Guardian",
    version: "0.1.0",
    docs: "/docs",
    live_service_url: "/api/v1/inspect-protocol",
  })
);

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "🌐 API listening — docs at /docs");
  });
}

export { app };
