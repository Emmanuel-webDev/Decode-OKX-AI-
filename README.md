# 🛡️ Decode Guardian — X Layer Security ASP

Live on OKX AI Marketplace — Agent #5255
- Try it: [okx.ai/agents/5255](https://www.okx.ai/agents/5255)
- API: https://decode-okx-ai-production.up.railway.app/api/v1/inspect-protocol
- Docs: https://decode-okx-ai-production.up.railway.app/docs
- Telegram: [@XLayerFraudGuard_bot](tg://resolve?domain=XLayerFraudGuard_bot)

Built for the OKX AI Genesis Hackathon.

Autonomous security infrastructure for X Layer. Watches proxy upgrades and admin transfers on target protocols in real time, produces structured risk verdicts, and pushes alerts to Telegram — callable by humans, by other agents on OKX.AI, and over MCP.

Built for the **OKX.AI Genesis Hackathon** (Finance Copilot track).

---

## Why this exists

Traditional dashboards wait for users to check them. By the time you notice a proxy upgrade or admin swap, funds are already gone. Decode inverts this: it watches the chain, applies deterministic rules first, uses an LLM only to explain what was found (never to invent security claims), and pushes alerts before positions are drained.

## What it does (v0.1)

- **Monitors** `Upgraded(address)` and `AdminChanged(address,address)` events on a configurable set of X Layer proxies.
- **Extracts structured facts** deterministically: previous vs new implementation, whether the new admin is an EOA, whether the new impl has code.
- **Scores risk** using rule-based heuristics first (LLM-independent).
- **Explains** the risk with Gemini (structured facts in → strict JSON verdict out). Falls back to heuristic verdict on timeout / rate-limit / bad shape.
- **Caches** every assessment in Supabase (keyed by event) so repeated queries are instant and free.
- **Alerts** subscribers on Telegram with a Markdown-formatted verdict.
- **Exposes** the same engine three ways: HTTP API + Swagger, MCP tool over stdio, OKX.AI marketplace listing.

## Architecture

```
                     ┌─────────────────────────────┐
   X Layer RPC ────► │  ChainMonitor (viem)        │
                     │  Upgraded + AdminChanged    │
                     └──────────────┬──────────────┘
                                    ▼
                     ┌─────────────────────────────┐
                     │ Analyzer Pipeline           │
                     │  1. cache check             │
                     │  2. extractFacts (rules)    │
                     │  3. Gemini explain (opt.)   │
                     │  4. deterministic fallback  │
                     │  5. cache write             │
                     └──────┬──────────────┬───────┘
                            ▼              ▼
                  ┌──────────────┐   ┌─────────────┐
                  │ Telegram bot │   │ HTTP API +  │
                  │ broadcast    │   │ MCP tool    │
                  └──────────────┘   └─────────────┘
```

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Chain client | viem | Typed, modern, works with X Layer's OP-Stack RPC |
| LLM | Gemini 3.5 Flash | Free tier, fast, JSON-mode support |
| Cache & subs | Supabase | Free tier, hosted Postgres, real |
| Alerts | Telegraf | Battle-tested Telegram bot lib |
| API | Express + swagger-ui-express | Judges click `/docs`, hit "Try it out" |
| MCP | @modelcontextprotocol/sdk | Native MCP over stdio for Claude Desktop / Cursor |
| Runtime | Node 20+, TypeScript, tsx | Fast dev loop |

## Setup

```bash
cp .env.example .env
# fill in GEMINI_API_KEY, SUPABASE_*, TELEGRAM_BOT_TOKEN
# WATCH_PROXIES comes pre-seeded with real X Layer contracts (xBTC, USDT0, USDG)
npm install
npm run dev
```

### Supabase (optional but recommended)

1. Create a free project at https://supabase.com
2. Project Settings → API → copy the URL and `service_role` key into `.env`
3. SQL Editor → New query → paste the contents of `migrations/0001_init.sql` → Run

Skip these steps and Decode falls back to an in-memory cache. Fine for demo, will lose subscriber list on restart.

### Telegram bot

1. DM @BotFather on Telegram → `/newbot` → follow prompts → copy the token into `.env`
2. Message your bot `/start` then `/watch 0xB7c00000BCDEeF966B20b3d884B98E64D2b06B4F` to subscribe to xBTC alerts

### Deploy

- **Railway**: fork the repo, click "Deploy on Railway", paste env vars — `railway.json` handles the rest, `/health` is wired for healthchecks.
- **Docker**: `docker build -t decode-guardian . && docker run -p 8080:8080 --env-file .env decode-guardian`

The app degrades gracefully — no Gemini key means heuristics-only. No Supabase means in-memory cache. No Telegram means silent broadcast.

## Run a demo

```bash
# In one terminal
npm run dev

# In another
npm run simulate            # simulates admin transfer to EOA (CRITICAL)
npm run simulate upgrade    # simulates malicious impl upgrade
```

Watch your Telegram (if `TELEGRAM_BOT_TOKEN` set + you've `/start`ed and `/watch`ed the demo proxy) — a formatted alert lands in <2s.

## Live API surfaces

- `POST /api/v1/inspect-protocol` `{ "address": "0x..." }` → assessment JSON
- `GET /docs` → interactive Swagger UI
- `GET /health` → liveness

## MCP client config

```json
{
  "mcpServers": {
    "decode-guardian": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/decode-guardian/src/mcp/server.ts"]
    }
  }
}
```

Then in Claude Desktop / Cursor: *"Ask Decode whether 0xABC... on X Layer is safe."*

## Roadmap (post-hackathon)

- Anomalous outflow detection (baseline TVL + z-score alerting)
- Bytecode diffing between old + new impl (compare selectors added/removed)
- `simulate_agent_interaction` MCP tool — decode calldata + eth_call state override
- Timelock detection heuristics
- Web dashboard for subscriber management

## Honest limits

- Decode does **not** audit contracts. It reacts to on-chain admin events.
- The LLM never claims to have read bytecode it wasn't shown. If Gemini fails, the deterministic verdict is what you get.
- Coverage is only as good as `WATCH_PROXIES` — the value comes from curating the right set of X Layer venues.

## License

MIT.
