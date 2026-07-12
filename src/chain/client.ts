import { createPublicClient, defineChain, http, webSocket } from "viem";
import { config } from "../config.js";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [config.XLAYER_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
});

export const publicClient = createPublicClient({
  chain: xLayer,
  transport: config.XLAYER_WS_URL.startsWith("wss")
    ? webSocket(config.XLAYER_WS_URL)
    : http(config.XLAYER_RPC_URL),
});

export const httpClient = createPublicClient({
  chain: xLayer,
  transport: http(config.XLAYER_RPC_URL),
});
