#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://www.docrenders.com";

function getApiKey(): string {
  const key = process.env.DOCRENDERS_API_KEY;
  if (!key) throw new Error("DOCRENDERS_API_KEY environment variable is not set");
  return key;
}

async function callApi(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const detail = (err?.error as Record<string, string>)?.message ?? `HTTP ${res.status}`;
    throw new Error(`DocRenders API error: ${detail}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  const bytes = await res.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

async function callApiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Authorization": `Bearer ${getApiKey()}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const detail = (err?.error as Record<string, string>)?.message ?? `HTTP ${res.status}`;
    throw new Error(`DocRenders API error: ${detail}`);
  }
  return res.json();
}

interface FieldDef {
  type: string;
  required: boolean;
  description?: string;
  example?: unknown;
  ai_hint?: string;
  item_schema?: Record<string, FieldDef>;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  source: string;
  preview_url?: string | null;
  fields: Record<string, FieldDef>;
}

interface ListTemplatesResponse {
  templates: TemplateItem[];
}

const server = new McpServer({
  name: "docrenders",
  version: "0.4.0",
});

server.tool(
  "render",
  "Convert Markdown or HTML to a PDF. Returns a signed download URL valid for 15 minutes.",
  {
    markdown: z.string().optional().describe("Markdown content to render (GFM supported)"),
    html: z.string().optional().describe("Raw HTML content to render. Alternative to markdown."),
    template: z.string().optional()
      .describe("Built-in template name to apply for styling (e.g. \"invoice\"). Use render_template instead if you want to inject structured data."),
    filename: z.string().optional().describe("Name of the stored PDF file (e.g. \"invoice-123.pdf\"). Defaults to \"render.pdf\"."),
    format: z.enum(["A4", "Letter", "Legal"]).optional().default("A4").describe("Page size"),
    landscape: z.boolean().optional().default(false).describe("Landscape orientation"),
    margin_top: z.string().optional().describe("Top margin as a CSS length (e.g. \"1in\", \"20mm\"). Defaults to \"1in\"."),
    margin_right: z.string().optional().describe("Right margin. Defaults to \"1in\"."),
    margin_bottom: z.string().optional().describe("Bottom margin. Defaults to \"1in\"."),
    margin_left: z.string().optional().describe("Left margin. Defaults to \"1in\"."),
  },
  async ({ markdown, html, template, filename, format, landscape, margin_top, margin_right, margin_bottom, margin_left }) => {
    if (!markdown && !html) {
      return { content: [{ type: "text", text: "Error: provide either markdown or html" }], isError: true };
    }
    try {
      const result = await callApi("/render", {
        markdown, html, template, filename,
        output: "url",
        options: { format, landscape, margin_top, margin_right, margin_bottom, margin_left },
      }) as { url: string; expires_at: string; render_time_ms: number };
      return {
        content: [{
          type: "text",
          text: `PDF generated successfully.\n\nDownload URL: ${result.url}\nExpires: ${result.expires_at}\nRender time: ${result.render_time_ms}ms`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

server.tool(
  "render_template",
  "Generate a PDF from a DocRenders template by passing structured data. The template provides the document layout and styling. Use list_templates to see available templates and their required fields, or get_template for a specific template's schema.",
  {
    template: z.string()
      .describe("Template name (e.g. \"invoice\", \"resume\"). Use list_templates to see all available templates."),
    data: z.record(z.string(), z.unknown()).describe("Data fields for the template. Required and optional fields vary by template — call get_template to see the schema."),
    filename: z.string().optional().describe("Name of the stored PDF file (e.g. \"invoice-123.pdf\"). Defaults to \"render.pdf\"."),
    format: z.enum(["A4", "Letter", "Legal"]).optional().default("A4").describe("Page size"),
    landscape: z.boolean().optional().default(false).describe("Landscape orientation"),
    margin_top: z.string().optional().describe("Top margin as a CSS length (e.g. \"1in\", \"20mm\"). Defaults to \"1in\"."),
    margin_right: z.string().optional().describe("Right margin. Defaults to \"1in\"."),
    margin_bottom: z.string().optional().describe("Bottom margin. Defaults to \"1in\"."),
    margin_left: z.string().optional().describe("Left margin. Defaults to \"1in\"."),
  },
  async ({ template, data, filename, format, landscape, margin_top, margin_right, margin_bottom, margin_left }) => {
    try {
      const result = await callApi("/render", {
        template, data, filename,
        output: "url",
        options: { format, landscape, margin_top, margin_right, margin_bottom, margin_left },
      }) as { url: string; expires_at: string; render_time_ms: number };
      return {
        content: [{
          type: "text",
          text: `PDF generated successfully.\n\nDownload URL: ${result.url}\nExpires: ${result.expires_at}\nRender time: ${result.render_time_ms}ms`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

server.tool(
  "list_templates",
  "List all available DocRenders templates with their categories, tags, and field schemas. Supports optional filtering by category or tag.",
  {
    category: z.string().optional().describe("Filter by category (e.g. \"Business\", \"Technical\", \"Personal\")"),
    tag: z.string().optional().describe("Filter by tag (e.g. \"billing\", \"ai\", \"career\")"),
  },
  async ({ category, tag }) => {
    try {
      let path = "/templates";
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (tag) params.set("tag", tag);
      if (params.toString()) path += `?${params.toString()}`;

      const resp = await callApiGet(path) as ListTemplatesResponse;
      const templates = resp.templates ?? [];

      if (templates.length === 0) {
        return { content: [{ type: "text", text: "No templates found matching the given filters." }] };
      }

      const lines: string[] = ["# DocRenders Templates\n"];
      for (const t of templates) {
        lines.push(`## ${t.name} (\`${t.id}\`)`);
        lines.push(`*${t.category}* | Version ${t.version}`);
        lines.push(t.description);
        if (t.tags.length) lines.push(`Tags: ${t.tags.join(", ")}`);
        if (t.preview_url) lines.push(`Preview: ${t.preview_url}`);

        const required = Object.entries(t.fields).filter(([, f]) => f.required).map(([k]) => k);
        const optional = Object.entries(t.fields).filter(([, f]) => !f.required).map(([k]) => k);
        if (required.length) lines.push(`\n**Required fields:** ${required.join(", ")}`);
        if (optional.length) lines.push(`**Optional fields:** ${optional.join(", ")}`);
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

server.tool(
  "get_template",
  "Get the full field schema for a specific DocRenders template, including field types, descriptions, and examples.",
  {
    name: z.string().describe("Template name (e.g. \"invoice\", \"resume\")"),
  },
  async ({ name }) => {
    try {
      const t = await callApiGet(`/templates/${encodeURIComponent(name)}`) as TemplateItem;
      const lines: string[] = [
        `# ${t.name}`,
        `*${t.category}* | Version ${t.version}`,
        t.description,
        "",
        "## Fields",
      ];
      for (const [fieldName, field] of Object.entries(t.fields)) {
        const req = field.required ? "required" : "optional";
        const ex = field.example !== undefined ? ` — example: \`${JSON.stringify(field.example)}\`` : "";
        const hint = field.ai_hint ? ` *(${field.ai_hint})*` : "";
        lines.push(`- **${fieldName}** (\`${field.type}\`, ${req}): ${field.description ?? ""}${ex}${hint}`);
        if (field.item_schema) {
          for (const [subName, subField] of Object.entries(field.item_schema)) {
            const subReq = subField.required ? "required" : "optional";
            lines.push(`  - **${subName}** (\`${subField.type}\`, ${subReq}): ${subField.description ?? ""}`);
          }
        }
      }
      if (t.tags.length) {
        lines.push("", `Tags: ${t.tags.join(", ")}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

server.tool(
  "render_template_preview",
  "Generate a preview PDF for a DocRenders template using its built-in preview_fields data. Returns a signed download URL. Previews are cached — repeated calls for the same template return instantly. Does not count against your render quota.",
  {
    template: z.string().describe("Template name (e.g. \"invoice\", \"resume\") or user template ID (tpl_…)"),
    data: z.record(z.string(), z.unknown()).optional().describe("Optional data overrides. Omit to use the template's built-in preview_fields."),
  },
  async ({ template, data }) => {
    try {
      const result = await callApi(`/templates/${encodeURIComponent(template)}/preview`, {
        ...(data ? { data } : {}),
      }) as { url: string; expires_at: string };
      return {
        content: [{
          type: "text",
          text: `Preview PDF ready.\n\nDownload URL: ${result.url}\nExpires: ${result.expires_at}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

server.tool(
  "get_usage",
  "Check the current period render usage for the authenticated DocRenders account.",
  {},
  async () => {
    try {
      const usage = await callApiGet("/usage") as {
        plan: string;
        renders: { used: number; limit: number; period: string };
        rate_limit: { requests_per_minute: number };
      };
      return {
        content: [{
          type: "text",
          text: [
            `Plan: ${usage.plan}`,
            `Renders: ${usage.renders.used} / ${usage.renders.limit} used (${usage.renders.period})`,
            `Rate limit: ${usage.rate_limit.requests_per_minute} requests/minute`,
          ].join("\n"),
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
