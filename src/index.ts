import { ChainMonitor } from "./chain/monitor.js";
import { analyzeEvent } from "./analyzer/pipeline.js";
import { broadcastAlert, startBot } from "./telegram/bot.js";
import { app } from "./api/server.js";
import { config, features } from "./config.js";
import { logger } from "./logger.js";

function printBanner() {
  const line = (label: string, ok: boolean, detail?: string) =>
    `  ${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`;

  const banner = [
    "",
    "  ╔══════════════════════════════════════════╗",
    "  ║   🛡️  DECODE GUARDIAN  🛡️                 ║",
    "  ║   X Layer Security ASP · v0.1.0          ║",
    "  ╚══════════════════════════════════════════╝",
    "",
    "  Feature readiness:",
    line("Chain RPC", true, config.XLAYER_RPC_URL),
    line("Gemini LLM", features.gemini, features.gemini ? "enabled" : "heuristics-only fallback active"),
    line("Supabase cache", features.supabase, features.supabase ? "persistent" : "in-memory (data lost on restart)"),
    line("Telegram bot", features.telegram, features.telegram ? "enabled" : "alerts disabled"),
    line(
      "Watched proxies",
      config.WATCH_PROXIES.length > 0,
      `${config.WATCH_PROXIES.length} address(es)`
    ),
    "",
  ].join("\n");
  console.log(banner);
}

async function main() {
  printBanner();

  // 1. HTTP API (Swagger docs live here)
  app.listen(config.PORT, () =>
    logger.info({ port: config.PORT }, "🌐 API listening — /docs")
  );

  // 2. Telegram bot
  await startBot();

  // 3. Chain monitor
  const monitor = new ChainMonitor();
  monitor.onEvent(async (event) => {
    const assessment = await analyzeEvent(event);
    logger.warn(
      {
        proxy: assessment.proxy,
        verdict: assessment.verdict,
        score: assessment.risk_score,
        source: assessment.source,
      },
      "📊 Assessment complete"
    );
    await broadcastAlert(assessment);
  });
  await monitor.start();

  logger.info("✓ Decode Guardian fully operational");
}

main().catch((err) => {
  logger.error({ err }, "Fatal boot error");
  process.exit(1);
});
