#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRuzTools } from "./ruz/tools.js";

// Версия берётся из package.json, чтобы при релизе её не нужно было править здесь.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const server = new McpServer({
  name: "hse-ruz-mcp",
  version,
});

registerRuzTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("hse-ruz-mcp fatal error:", err);
  process.exit(1);
});
