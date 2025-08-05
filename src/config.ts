import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
export { VERSION } from "./version";

/**
 * Return the platform-specific JSON file that stores the long-lived auth token.
 * macOS →  ~/Library/Application Support/GloriaMundo/config.json
 * Windows → %APPDATA%\GloriaMundo\config.json
 * Linux  →  ~/.gloriamundo-mcp/config.json
 */
export function getConfigPath(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "GloriaMundo",
      "config.json",
    );
  }
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "GloriaMundo", "config.json");
  }
  // Linux / everything else
  return path.join(home, ".gloriamundo-mcp", "config.json");
}

/** Discover or create the auth token used by the web UI ↔ helper handshake. */
export function resolveToken(): string {
  const configPath = getConfigPath();
  let token = process.env.MCP_HOST_TOKEN;

  if (!token && fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (typeof data.token === "string") token = data.token;
    } catch {
      /* ignore corrupt JSON */
    }
  }

  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2),
    );
  }

  return token;
}

/** Allowed CORS origins for the helper’s HTTP API. */
export function resolveAllowedOrigins(): string[] {
  const env = process.env.MCP_ALLOWED_ORIGINS;
  return env
    ? env
        .split(",")
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    : ["https://gloriamundo.com"];
}
