import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAddress, isAddress } from "viem";
import { inspectProtocol } from "../analyzer/pipeline.js";
import { logger } from "../logger.js";

const server = new Server(
  { name: "decode-guardian", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "inspect_protocol_safety",
      description:
        "Returns the most recent Decode security assessment for an X Layer proxy/pool address: risk score, verdict, detected signals, and human-readable summary. Call BEFORE routing user funds into an unfamiliar protocol.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "EVM address on X Layer (0x...)",
          },
        },
        required: ["address"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "inspect_protocol_safety") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  const address = (req.params.arguments as { address?: string })?.address;
  if (!address || !isAddress(address)) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: "invalid_address" }) },
      ],
      isError: true,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(
      "https://decode-okx-ai-production.up.railway.app/api/v1/inspect-protocol",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
        signal: controller.signal, // ← wired in
      },
    );
    const result = await response.json();
    clearTimeout(timeout); // ← before return, reachable
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    clearTimeout(timeout); // ← also clear on error
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "fetch_failed",
            detail: (err as Error).message,
          }),
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  logger.info("✓ MCP server connected over stdio");
});

export { server };
