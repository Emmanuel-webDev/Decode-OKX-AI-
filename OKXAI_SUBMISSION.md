Live surfaces:
- API: https://<railway-domain>/api/v1/inspect-protocol
- Swagger: https://<railway-domain>/docs
- Telegram bot: @XLayerFraudGuard_bot
- MCP server: see repo README

# OKX.AI ASP Listing — Decode Guardian

Paste-ready copy for the OKX.AI marketplace submission (Monday). All fields written to fit the marketplace tone (see CertiK, Onchain Data Explorer, AlphaCopy listings for pattern).

---

## Name
**Decode Guardian**

## Tagline (one line)
Catches the upgrade before the drain — real-time X Layer protocol security.

## Category
Finance / Software services

## Suggested price
0.1 USDT per call (matches Onchain Arb Scout, AlphaCopy pricing tier)

## Short description (for card view, ~2 sentences)
Real-time security monitor for X Layer protocols. Ask about any pool or proxy address and get a structured risk verdict backed by on-chain evidence — proxy upgrades, admin transfers, and access-control changes flagged before your funds are at risk.

## Long description (for detail page)

Traditional security dashboards wait for users to check them. By the time you notice a proxy upgrade or admin swap on your lending pool, funds are already moving. Decode inverts this: it watches X Layer around the clock, applies deterministic on-chain rules first, uses an LLM only to explain what was found (never to invent security opinions), and returns a structured verdict you or your agent can act on.

**What Decode detects:**
- **Malicious proxy upgrades** — implementation swaps to unverified or code-less contracts
- **Admin key takeover** — proxy ownership transferred to an EOA (single private key, no multisig, no timelock)
- **EIP-1967 storage manipulation** — direct writes to admin/implementation slots

**How it answers you:**
Every response includes a 0-100 risk score, a LOW/MEDIUM/HIGH/CRITICAL verdict, a plain-English summary, and the raw signals that produced the score. Nothing hallucinated — the LLM only explains signals the deterministic rule engine already found.

**Try asking:**
1. "Is 0xB7c00000BCDEeF966B20b3d884B98E64D2b06B4F safe?" (xBTC proxy on X Layer)
2. "Any recent security events on the Aave USDT0 pool?"
3. "Should I approve this transaction? Here's the calldata: 0x..."

**Why X Layer:**
X Layer's admin architecture is central-sequencer + multisig upgradeable proxies. That model has real efficiency benefits and real security surface — the same surface Decode watches. Coverage today: xBTC, USDT0, USDG, and every proxy contract the user adds.

**Honest limits:**
Decode is not a full audit service. It reacts to on-chain events, not to source code review. For contract-level audits, use CertiK or Zellic. Decode complements those by watching what changes after the audit ships.

## Try prompts (3-5 short queries a user can send)

1. `Check safety of 0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f on X Layer`
2. `Has USDT0 (0x779ded0c9e1022225f8e0630b35a9b54be713736) had any admin changes recently?`
3. `Explain the risk signals for this pool: 0x...`
4. `What should I do if my Aave pool proxy just upgraded?`

## Live service URL
`https://<your-railway-domain>.up.railway.app/api/v1/inspect-protocol`

## Documentation URL
`https://<your-railway-domain>.up.railway.app/docs`

## Supported networks
X Layer Mainnet (chain-id 196)

## GitHub
`https://github.com/<your-handle>/decode-guardian`

---

# X post draft (#OKXAI)

Traditional dashboards wait for users to get hacked.

Meet Decode Guardian — an Agent Service Provider on @okx AI that watches X Layer protocols in real time and pushes structured security verdicts before funds move.

- Proxy upgrades ✓
- Admin key changes ✓
- EIP-1967 slot tampering ✓

Try it: [link]
Docs: [link]
Demo (90s): [video]

Built for the OKX AI Genesis Hackathon.
#OKXAI @XLayerOfficial

---

# 90s demo script (final)

**0:00-0:10 — Cold open**
Voice over black terminal: *"An X Layer protocol just changed its admin key to a fresh EOA. Nobody in the pool knows yet."*

**0:10-0:35 — Detection**
Split screen. Left: your terminal running `npm run simulate`. Right: Telegram Desktop.
- Terminal shows the chain event log streaming, then the Decode monitor catches `AdminChanged`
- Structured facts appear color-coded (chalk/pino-pretty)
- ~1 second later, Telegram lights up with the CRITICAL alert
- Voice: *"Decode sees the admin change, checks whether the new admin has contract code — it doesn't, it's an EOA — and pushes a CRITICAL alert to every subscriber in under two seconds."*

**0:35-1:05 — Agent-to-agent MCP call**
Switch to Claude Desktop or Cursor with Decode's MCP server loaded.
- Type: *"I'm about to route funds into 0xB7c0…4F on X Layer. Ask Decode if it's safe."*
- Show the AI agent calling `inspect_protocol_safety` tool
- Show the structured JSON verdict come back
- Voice: *"Because Decode ships as an MCP server, any AI agent — Claude, Cursor, or a custom trading bot — can ask about a protocol before it signs a transaction. This is what agent-to-agent security looks like."*

**1:05-1:25 — Live listing**
Cut to Swagger docs page in browser, then to the OKX.AI listing page.
- Voice: *"Decode is live on OKX.AI right now — pay 0.1 USDT per call, or self-host from the open-source repo. Every response is cached, so repeat queries are free."*

**1:25-1:30 — Close**
Full-screen slide: repo URL, X Layer address for tips, #OKXAI hashtag.
Voice: *"Decode Guardian. Autonomous X Layer security. Built for OKX AI Genesis."*
