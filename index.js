import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const BASE_URL = "https://api.figma.com/v1";

async function figmaFetch(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { "X-Figma-Token": FIGMA_TOKEN },
  });
  if (!res.ok) throw new Error(`Figma API error: ${res.status} ${await res.text()}`);
  return res.json();
}

const server = new McpServer({
  name: "figma",
  version: "1.0.0",
});

server.tool(
  "get_file",
  "Get a Figma file's structure and metadata",
  { fileKey: z.string().describe("The file key from the Figma URL") },
  async ({ fileKey }) => {
    const data = await figmaFetch(`/files/${fileKey}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_node",
  "Get specific nodes from a Figma file",
  {
    fileKey: z.string().describe("The file key from the Figma URL"),
    nodeIds: z.string().describe("Comma-separated node IDs (e.g. '744-25869')"),
  },
  async ({ fileKey, nodeIds }) => {
    const ids = nodeIds.replace(/-/g, ":");
    const data = await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_styles",
  "Get styles used in a Figma file",
  { fileKey: z.string().describe("The file key from the Figma URL") },
  async ({ fileKey }) => {
    const data = await figmaFetch(`/files/${fileKey}/styles`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_images",
  "Export images/assets from a Figma file",
  {
    fileKey: z.string().describe("The file key from the Figma URL"),
    nodeIds: z.string().describe("Comma-separated node IDs to export"),
    format: z.enum(["png", "svg", "jpg", "pdf"]).default("png"),
    scale: z.number().default(2),
  },
  async ({ fileKey, nodeIds, format, scale }) => {
    const ids = nodeIds.replace(/-/g, ":");
    const data = await figmaFetch(`/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_components",
  "Get components in a Figma file",
  { fileKey: z.string().describe("The file key from the Figma URL") },
  async ({ fileKey }) => {
    const data = await figmaFetch(`/files/${fileKey}/components`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
