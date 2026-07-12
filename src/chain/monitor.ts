import {
  parseAbiItem,
  type Address,
  type Log,
  getAddress,
} from "viem";
import { publicClient, httpClient } from "./client.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * EIP-1967 Upgraded event — emitted by transparent + UUPS proxies
 * when the implementation address changes.
 */
export const upgradedEvent = parseAbiItem(
  "event Upgraded(address indexed implementation)"
);

/**
 * EIP-1967 AdminChanged event — signals ownership transfer of the proxy,
 * often the first step in a takeover.
 */
export const adminChangedEvent = parseAbiItem(
  "event AdminChanged(address previousAdmin, address newAdmin)"
);

export type UpgradeEvent = {
  kind: "upgrade";
  proxy: Address;
  newImplementation: Address;
  blockNumber: bigint;
  txHash: `0x${string}`;
  timestamp: number;
};

export type AdminChangeEvent = {
  kind: "admin_change";
  proxy: Address;
  previousAdmin: Address;
  newAdmin: Address;
  blockNumber: bigint;
  txHash: `0x${string}`;
  timestamp: number;
};

export type MonitorEvent = UpgradeEvent | AdminChangeEvent;
export type EventHandler = (event: MonitorEvent) => Promise<void>;

export class ChainMonitor {
  private handlers: EventHandler[] = [];
  private unwatches: (() => void)[] = [];

  onEvent(handler: EventHandler) {
    this.handlers.push(handler);
  }

  async start() {
    const proxies = config.WATCH_PROXIES as Address[];
    if (proxies.length === 0) {
      logger.warn(
        "No WATCH_PROXIES configured — monitor will watch ALL Upgraded events chain-wide (noisy)."
      );
    } else {
      logger.info(
        { count: proxies.length, proxies },
        "Monitor starting on proxy set"
      );
    }

    // Watch Upgraded
    const unwatchUpgrade = publicClient.watchEvent({
      address: proxies.length ? proxies : undefined,
      event: upgradedEvent,
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleUpgrade(log);
        }
      },
      onError: (err) => logger.error({ err }, "Upgraded watcher error"),
    });
    this.unwatches.push(unwatchUpgrade);

    // Watch AdminChanged
    const unwatchAdmin = publicClient.watchEvent({
      address: proxies.length ? proxies : undefined,
      event: adminChangedEvent,
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleAdminChange(log);
        }
      },
      onError: (err) => logger.error({ err }, "AdminChanged watcher error"),
    });
    this.unwatches.push(unwatchAdmin);

    logger.info("✓ ChainMonitor watching X Layer");
  }

  stop() {
    this.unwatches.forEach((u) => u());
    this.unwatches = [];
  }

  private async handleUpgrade(log: Log) {
    // viem gives us `args` on decoded event logs
    const decoded = log as unknown as {
      address: Address;
      blockNumber: bigint;
      transactionHash: `0x${string}`;
      args: { implementation: Address };
    };
    const block = await httpClient.getBlock({
      blockNumber: decoded.blockNumber,
    });
    const event: UpgradeEvent = {
      kind: "upgrade",
      proxy: getAddress(decoded.address),
      newImplementation: getAddress(decoded.args.implementation),
      blockNumber: decoded.blockNumber,
      txHash: decoded.transactionHash,
      timestamp: Number(block.timestamp),
    };
    logger.warn({ event }, "🚨 Upgraded event captured");
    await Promise.all(this.handlers.map((h) => h(event).catch((err) =>
      logger.error({ err }, "Handler crashed on upgrade event")
    )));
  }

  private async handleAdminChange(log: Log) {
    const decoded = log as unknown as {
      address: Address;
      blockNumber: bigint;
      transactionHash: `0x${string}`;
      args: { previousAdmin: Address; newAdmin: Address };
    };
    const block = await httpClient.getBlock({
      blockNumber: decoded.blockNumber,
    });
    const event: AdminChangeEvent = {
      kind: "admin_change",
      proxy: getAddress(decoded.address),
      previousAdmin: getAddress(decoded.args.previousAdmin),
      newAdmin: getAddress(decoded.args.newAdmin),
      blockNumber: decoded.blockNumber,
      txHash: decoded.transactionHash,
      timestamp: Number(block.timestamp),
    };
    logger.warn({ event }, "🚨 AdminChanged event captured");
    await Promise.all(this.handlers.map((h) => h(event).catch((err) =>
      logger.error({ err }, "Handler crashed on admin change event")
    )));
  }
}
