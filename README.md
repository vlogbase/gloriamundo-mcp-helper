
# GloriaMundo MCP Host

## Quick start

Requires Node 18+

```bash
pnpm install  # or npm install
pnpm dev      # or npm run dev
```

The server logs the host URL and the generated MCP token on startup.

## Configuration

Environment variables:

- `MCP_HOST_PORT` – port to listen on (default `9000`).
- `MCP_HOST_TOKEN` – authentication token. If not set, a token is generated and
  persisted to a config file.

### Token storage

The generated token is stored in:

- **Linux**: `~/.gloriamundo-mcp/config.json`
- **macOS**: `~/Library/Application Support/GloriaMundo/config.json`
- **Windows**: `%APPDATA%\GloriaMundo\config.json`

## Example

```bash
curl http://localhost:9000/health
curl -H "Authorization: Bearer <TOKEN>" http://localhost:9000/mcp/tools/<id>
```
