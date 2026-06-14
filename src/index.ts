#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://www.docrenders.com";

const TEMPLATES: Record<string, { description: string; required: string[]; optional: string[] }> = {
  invoice: {
    description: "Professional invoice with line items, totals, sender/recipient blocks, and logo",
    required: ["name", "date", "total", "items"],
    optional: ["from", "from_street", "from_city", "from_email", "due_date", "invoice_number", "title", "subtotal", "tax", "notes", "logo"],
  },
  receipt: {
    description: "Payment receipt with merchant, items, totals, and payment method",
    required: ["merchant", "date", "total", "items"],
    optional: ["transaction_id", "subtotal", "tax", "payment_method", "notes", "logo"],
  },
  resume: {
    description: "Clean typographic CV layout with sections for experience, education, and skills",
    required: ["name", "email"],
    optional: ["phone", "location", "linkedin", "github", "summary", "experience", "education", "skills"],
  },
  "ai-summary": {
    description: "Dark header report with executive summary callout, key findings, and sections — designed for AI-generated analysis",
    required: ["title", "date", "summary"],
    optional: ["model", "author", "key_points", "sections"],
  },
  report: {
    description: "Business report with optional executive summary and structured sections",
    required: ["title", "author", "date", "sections"],
    optional: ["executive_summary", "logo"],
  },
  letter: {
    description: "Formal business letter with sender, recipient, subject, body, and signature",
    required: ["sender_name", "recipient_name", "date", "body", "signature_name"],
    optional: ["sender_address", "recipient_address", "subject", "salutation", "closing"],
  },
  proposal: {
    description: "Project or sales proposal with client details, structured sections, and logo",
    required: ["title", "client", "date", "prepared_by", "sections"],
    optional: ["logo"],
  },
  post: {
    description: "WordPress-style blog post with title, author, date, category, tags, featured image, and Markdown body",
    required: ["title", "author", "date", "content"],
    optional: ["category", "tags", "featured_image"],
  },
  "woo-invoice": {
    description: "WooCommerce order invoice with shop details, billing address, line items, and payment info",
    required: ["order_number", "invoice_number", "invoice_date", "shop_name", "billing_name", "total"],
    optional: ["due_date", "order_date", "shop_email", "shop_address", "shop_vat_id", "billing_email", "billing_address", "billing_phone", "billing_vat_id", "shipping_address", "items", "subtotal", "shipping_cost", "tax_lines", "discount", "payment_method", "shipping_method", "show_sku", "show_tax_columns", "notes", "footer_text", "logo"],
  },
};

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

const server = new McpServer({
  name: "docrenders",
  version: "1.0.0",
});

server.tool(
  "render",
  "Convert Markdown or HTML to a PDF. Returns a signed download URL valid for 15 minutes.",
  {
    markdown: z.string().optional().describe("Markdown content to render (GFM supported)"),
    html: z.string().optional().describe("Raw HTML content to render. Alternative to markdown."),
    template: z.enum(["invoice", "woo-invoice", "post", "receipt", "resume", "ai-summary", "report", "letter", "proposal"]).optional()
      .describe("Built-in template to apply for styling. Use render_template instead if you want to inject structured data."),
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
  "Generate a PDF from a built-in DocRenders template by passing structured data. The template provides the document layout and styling. Use list_templates to see available templates and their required fields.",
  {
    template: z.enum(["invoice", "woo-invoice", "post", "receipt", "resume", "ai-summary", "report", "letter", "proposal"])
      .describe("The template to use"),
    data: z.record(z.string(), z.unknown()).describe("Data fields for the template. Required and optional fields vary by template — call list_templates to see them."),
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
  "List all available DocRenders built-in templates with their required and optional data fields.",
  {},
  async () => {
    const lines: string[] = ["# DocRenders Templates\n"];
    for (const [name, info] of Object.entries(TEMPLATES)) {
      lines.push(`## ${name}`);
      lines.push(info.description);
      lines.push(`\n**Required fields:** ${info.required.join(", ")}`);
      if (info.optional.length) {
        lines.push(`**Optional fields:** ${info.optional.join(", ")}`);
      }
      lines.push("");
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
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
