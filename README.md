
# GloriaMundo MCP Host

A desktop application that runs locally to provide the infrastructure for Model Context Protocol (MCP) tools to interact with GloriaMundo.

## Features

- Host web server that accepts connections from GloriaMundo
- MCP tool execution and communication
- Token-based authentication
- CORS support

## Quick Start

```bash
npm ci
npm run build
npm start
```

The server logs the host URL and the generated MCP token on startup.

By default the helper binds to `127.0.0.1` on port `9000`. Advanced users can
override the bind address by setting `MCP_HOST_BIND=0.0.0.0` (or another
address) before starting the helper. You can verify it is running by visiting
[`http://127.0.0.1:9000/health`](http://127.0.0.1:9000/health).

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
curl http://127.0.0.1:9000/health
curl http://127.0.0.1:9000/config/public
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:9000/mcp/tools/<id>
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
