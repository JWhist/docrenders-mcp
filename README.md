# docrenders-mcp

MCP server for [DocRenders](https://docrenders.com) — generate production-ready PDFs from Claude and any MCP-compatible AI agent.

## Tools

| Tool | Description |
|---|---|
| `render` | Convert Markdown or HTML to a PDF |
| `render_template` | Generate a PDF from a built-in template with structured data |
| `list_templates` | List all available templates and their fields |
| `get_usage` | Check current period render usage |

## Setup

### 1. Get a DocRenders API key

Sign up at [docrenders.com](https://docrenders.com) and generate an API key from your dashboard.

### 2. Add to Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "docrenders": {
      "command": "npx",
      "args": ["-y", "docrenders-mcp"],
      "env": {
        "DOCRENDERS_API_KEY": "dcr_live_YOUR_API_KEY"
      }
    }
  }
}
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 3. Restart Claude Desktop

The DocRenders tools will be available in your next conversation.

## Usage examples

Once configured, you can ask Claude things like:

> *"Generate an invoice PDF for Acme Corp for $2,500 of design work, due June 17."*

> *"Create a PDF resume for Jordan Whistler, senior Go engineer, with experience at Acme and Startup Co."*

> *"Convert this markdown report to a PDF with the ai-summary template."*

> *"How many renders have I used this month?"*

## Available templates

| Template | Required fields |
|---|---|
| `invoice` | name, date, total, items |
| `receipt` | merchant, date, total, items |
| `resume` | name, email |
| `ai-summary` | title, date, summary |
| `report` | title, author, date, sections |
| `letter` | sender_name, recipient_name, date, body, signature_name |
| `proposal` | title, client, date, prepared_by, sections |

See [docs.docrenders.com](https://docrenders.com/docs.html#built-in-templates) for full field reference.

## Development

```bash
git clone https://github.com/JWhist/docrenders-mcp
cd docrenders-mcp
npm install
npm run build
DOCRENDERS_API_KEY=dcr_live_... node dist/index.js
```

## License

MIT
