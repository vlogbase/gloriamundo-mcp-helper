
# GloriaMundo MCP Host

A desktop application that runs locally to provide the infrastructure for Model Context Protocol (MCP) tools to interact with GloriaMundo.

## Features

- Host web server that accepts connections from GloriaMundo
- MCP tool execution and communication
- Token-based authentication
- CORS support

## Quick Start

```bash
npm ci && npm run build && node dist/host.js
```

By default the helper binds to `127.0.0.1` on port `9000`. Advanced users can
override the bind address by setting `MCP_HOST_BIND` before starting the
helper. You can verify it is running by visiting
[`http://localhost:9000/health`](http://localhost:9000/health).

The GloriaMundo website automatically retrieves the token from
`/config/public` and pairs with the helper; manual copying of the token is
rarely needed.

## Configuration

Environment variables:

- `MCP_HOST_PORT` – port to listen on (default `9000`).
- `MCP_HOST_TOKEN` – authentication token. If not set, a token is generated and
  persisted to a config file.
- `MCP_ALLOWED_ORIGINS` – comma-separated list of allowed CORS origins
  (default `https://gloriamundo.com`).
- `MCP_HOST_BIND` – address to bind to (default `127.0.0.1`).

### Token storage

The generated token is stored in:

- **Linux**: `~/.gloriamundo-mcp/config.json`
- **macOS**: `~/Library/Application Support/GloriaMundo/config.json`
- **Windows**: `%APPDATA%\GloriaMundo\config.json`

## Example

```bash
TOKEN=$(curl -s http://localhost:9000/config/public | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:9000/mcp/resources/yourClientId
```

## Building stand-alone binaries

Requirements: Node 20+ on the build machine.

```bash
cd desktop/host
npm ci
npm run pkg:all
```

Binaries will appear under `desktop/host/dist/pkg/`:

* `gm-mcp-host-linux-x64`
* `gm-mcp-host-macos-x64`
* `gm-mcp-host-macos-arm64`
* `gm-mcp-host-win-x64.exe`

### Running locally

```bash
./dist/pkg/gm-mcp-host-linux-x64
# or on macOS:
./dist/pkg/gm-mcp-host-macos-arm64
# on Windows:
dist\\pkg\\gm-mcp-host-win-x64.exe
```

Default port: 9000 (configurable via env). You can validate the build with:

```bash
../../scripts/self_test_helper.sh
```

> Note: binaries are unsigned; macOS users may need to right-click → Open.
> Windows may show a SmartScreen warning; choose “More info” → “Run anyway”.

## Operations API (technical preview)

- `GET /healthz` – health info  
- `GET /catalog/servers` – lists helper-provided local servers (e.g., `vault`, `fs`)  
- **Vault (auth required)**  
  - `POST /vault/:name` `{ "value": "secret" }` – create/update secret  
  - `DELETE /vault/:name` – delete secret  
  - `GET /vault/:name` – read secret (diagnostics)
- **Filesystem (read-only)**  
  - `GET /fs/list?path=.` – list directory under `MCP_FS_ROOT` (default: cwd)  
  - `GET /fs/read?path=path/to/file` – base64 contents (≤ `MCP_FS_MAX_READ_BYTES`, default 1MB)

Auth header: `Authorization: Bearer <MCP_HOST_TOKEN>` (or `X-Api-Key`)
