import { Telegraf } from "telegraf";
import { config, features } from "../config.js";
import { logger } from "../logger.js";
import { subscribers } from "../cache/supabase.js";
import type { Assessment } from "../analyzer/pipeline.js";

let bot: Telegraf | null = null;

const HELP = [
  "🛡️ *X-Layer Fraud Gaurd*",
  "Real-time X Layer security alerts.",
  "",
  "*Commands:*",
  "`/watch 0x...` — subscribe to a proxy/pool",
  "`/unwatch 0x...` — stop watching",
  "`/mine` — list your subscriptions",
  "`/help` — this menu",
  "",
  "You'll get a Markdown alert whenever Decode detects a suspicious upgrade or admin change on a protocol you watch.",
].join("\n");

function isAddress(a: string | undefined): a is `0x${string}` {
  return !!a && /^0x[a-fA-F0-9]{40}$/.test(a);
}

export function getBot(): Telegraf | null {
  if (!features.telegram) return null;
  if (bot) return bot;

  bot = new Telegraf(config.TELEGRAM_BOT_TOKEN!);

  bot.command("start", (ctx) => ctx.reply(HELP, { parse_mode: "Markdown" }));
  bot.command("help", (ctx) => ctx.reply(HELP, { parse_mode: "Markdown" }));

  bot.command("watch", async (ctx) => {
    const addr = ctx.message.text.split(/\s+/)[1];
    if (!isAddress(addr)) {
      await ctx.reply("Usage: `/watch 0xABC...`", { parse_mode: "Markdown" });
      return;
    }
    await subscribers.add(ctx.chat.id, addr);
    await ctx.reply(`✓ Watching \`${addr}\` on X Layer.`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("unwatch", async (ctx) => {
    const addr = ctx.message.text.split(/\s+/)[1];
    if (!isAddress(addr)) {
      await ctx.reply("Usage: `/unwatch 0xABC...`", { parse_mode: "Markdown" });
      return;
    }
    await subscribers.remove(ctx.chat.id, addr);
    await ctx.reply(`✓ Stopped watching \`${addr}\`.`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("mine", async (ctx) => {
    const list = await subscribers.forChat(ctx.chat.id);
    if (list.length === 0) {
      await ctx.reply(
        "No active subscriptions. Try `/watch 0xB7c00000BCDEeF966B20b3d884B98E64D2b06B4F` to track xBTC on X Layer.",
        { parse_mode: "Markdown" }
      );
      return;
    }
    const body = list.map((a, i) => `${i + 1}. \`${a}\``).join("\n");
    await ctx.reply(`*Your subscriptions:*\n${body}`, {
      parse_mode: "Markdown",
    });
  });

  bot.catch((err) => logger.error({ err }, "Telegraf error"));

  return bot;
}

export async function startBot() {
  const b = getBot();
  if (!b) {
    logger.warn("Telegram not configured — bot disabled");
    return;
  }
  await b.launch();
  logger.info("✓ Telegram bot launched");
  process.once("SIGINT", () => b.stop("SIGINT"));
  process.once("SIGTERM", () => b.stop("SIGTERM"));
}

export async function broadcastAlert(a: Assessment) {
  const b = getBot();
  if (!b) return;
  if (a.risk_score < config.ALERT_MIN_SCORE) return;

  const chatIds = await subscribers.chatsForProxy(a.proxy);

  logger.info(
  { proxy: a.proxy, score: a.risk_score, threshold: config.ALERT_MIN_SCORE, subscribers: chatIds.length },
  "broadcast decision"
);

  if (chatIds.length === 0) return;

  const emoji =
    a.verdict === "CRITICAL" ? "🚨" : a.verdict === "HIGH" ? "⚠️" : "ℹ️";

  const explorerUrl = `https://www.oklink.com/xlayer/address/${a.proxy}`;

  const msg = [
    `${emoji} *${a.verdict} SECURITY ALERT*`,
    ``,
    `*Protocol:* [\`${a.proxy}\`](${explorerUrl})`,
    `*Risk Score:* ${a.risk_score}/100`,
    ``,
    `*Analysis:* ${a.summary}`,
    a.user_action ? `\n*Suggested action:* ${a.user_action}` : "",
    `\n_Source: ${a.source}_`,
  ].join("\n");

  await Promise.allSettled(
    chatIds.map((id) =>
      b.telegram.sendMessage(id, msg, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      })
    )
  );
}
