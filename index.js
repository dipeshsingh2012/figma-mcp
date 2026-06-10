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

function simplifyNode(node) {
  const simplified = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.characters) simplified.text = node.characters;

  if (node.style) {
    simplified.textStyle = {
      fontSize: node.style.fontSize,
      fontWeight: node.style.fontWeight,
      fontFamily: node.style.fontFamily,
      textAlign: node.style.textAlignHorizontal,
      lineHeight: node.style.lineHeightPx,
    };
  }

  if (node.fills?.length > 0) {
    simplified.fills = node.fills
      .filter((f) => f.visible !== false)
      .map((f) => ({
        type: f.type,
        color: f.color
          ? `rgba(${Math.round(f.color.r * 255)},${Math.round(f.color.g * 255)},${Math.round(f.color.b * 255)},${f.color.a})`
          : undefined,
      }));
  }

  if (node.strokes?.length > 0) {
    simplified.strokes = node.strokes
      .filter((s) => s.visible !== false)
      .map((s) => ({
        color: s.color
          ? `rgba(${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${s.color.a})`
          : undefined,
      }));
  }

  if (node.cornerRadius) simplified.cornerRadius = node.cornerRadius;
  if (node.rectangleCornerRadii?.some((r) => r > 0))
    simplified.cornerRadii = node.rectangleCornerRadii;

  if (node.absoluteBoundingBox) {
    simplified.bounds = {
      w: node.absoluteBoundingBox.width,
      h: node.absoluteBoundingBox.height,
    };
  }

  if (node.layoutMode) {
    simplified.layout = {
      mode: node.layoutMode,
      gap: node.itemSpacing,
      padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      align: node.counterAxisAlignItems,
      justify: node.primaryAxisAlignItems,
    };
  }

  if (node.opacity !== undefined && node.opacity !== 1) simplified.opacity = node.opacity;
  if (node.visible === false) simplified.visible = false;

  if (node.children?.length > 0) {
    simplified.children = node.children.map(simplifyNode);
  }

  return simplified;
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
    const data = await figmaFetch(`/files/${fileKey}?depth=1`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_node",
  "Get specific nodes from a Figma file (simplified for component generation)",
  {
    fileKey: z.string().describe("The file key from the Figma URL"),
    nodeIds: z.string().describe("Comma-separated node IDs (e.g. '744-25869')"),
    depth: z.number().optional().describe("Depth of node tree to return"),
  },
  async ({ fileKey, nodeIds, depth }) => {
    const ids = nodeIds.replace(/-/g, ":");
    let url = `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`;
    if (depth !== undefined) url += `&depth=${depth}`;
    const data = await figmaFetch(url);

    const simplified = {};
    for (const [key, value] of Object.entries(data.nodes)) {
      simplified[key] = simplifyNode(value.document);
    }

    return { content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }] };
  }
);

server.tool(
  "get_node_children",
  "Get direct children IDs and names of a node (for navigating large trees)",
  {
    fileKey: z.string().describe("The file key from the Figma URL"),
    nodeId: z.string().describe("Single node ID (e.g. '473-25440')"),
  },
  async ({ fileKey, nodeId }) => {
    const id = nodeId.replace(/-/g, ":");
    const data = await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(id)}&depth=2`);
    const node = data.nodes[id]?.document;
    if (!node) return { content: [{ type: "text", text: "Node not found" }] };

    const children = (node.children || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      bounds: c.absoluteBoundingBox
        ? { w: c.absoluteBoundingBox.width, h: c.absoluteBoundingBox.height }
        : undefined,
      childCount: c.children?.length || 0,
    }));

    return { content: [{ type: "text", text: JSON.stringify({ name: node.name, type: node.type, children }, null, 2) }] };
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
