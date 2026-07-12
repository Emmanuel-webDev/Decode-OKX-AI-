/**
 * Demo trigger for the 90-second video.
 *
 * Usage:
 *   pnpm simulate               # simulates admin-to-EOA takeover
 *   pnpm simulate upgrade       # simulates malicious impl upgrade
 *
 * This does NOT hit the chain — it synthesizes a chain-shaped event and
 * feeds it through the same analyzer + Telegram broadcast path the live
 * monitor uses. Perfect for a repeatable demo.
 */
import { analyzeEvent } from "../src/analyzer/pipeline.js";
import { broadcastAlert } from "../src/telegram/bot.js";
import { logger } from "../src/logger.js";
import type { MonitorEvent } from "../src/chain/monitor.js";

const kind = process.argv[2] === "upgrade" ? "upgrade" : "admin_change";

const event: MonitorEvent =
  kind === "upgrade"
    ? {
        kind: "upgrade",
        proxy: "0x1111111111111111111111111111111111111111",
        newImplementation: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
        blockNumber: 1n,
        txHash: "0xabc",
        timestamp: Math.floor(Date.now() / 1000),
      }
    : {
        kind: "admin_change",
        proxy: "0x2222222222222222222222222222222222222222",
        previousAdmin: "0x000000000000000000000000000000000000dead",
        newAdmin: "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
        blockNumber: 1n,
        txHash: "0xdef",
        timestamp: Math.floor(Date.now() / 1000),
      };

(async () => {
  logger.warn({ event }, "▶️  simulating event");
  const assessment = await analyzeEvent(event);
  logger.warn({ assessment }, "📊 verdict");
  await broadcastAlert(assessment);
  logger.info("✓ done");
  process.exit(0);
})();
