#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRuzTools } from "./ruz/tools.js";

const server = new McpServer({
  name: "hse-ruz-mcp",
  version: "0.1.1",
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
