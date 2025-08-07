"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = void 0;
exports.getConfigPath = getConfigPath;
exports.resolveToken = resolveToken;
exports.resolveAllowedOrigins = resolveAllowedOrigins;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
/** Helper’s semantic version, injected at build time. */
exports.VERSION = process.env.GM_HELPER_VERSION || "0.0.0-dev";
/**
 * Return the platform-specific JSON file that stores the long-lived auth token.
 * macOS →  ~/Library/Application Support/GloriaMundo/config.json
 * Windows → %APPDATA%\GloriaMundo\config.json
 * Linux  →  ~/.gloriamundo-mcp/config.json
 */
function getConfigPath() {
    const home = os_1.default.homedir();
    if (process.platform === "darwin") {
        return path_1.default.join(home, "Library", "Application Support", "GloriaMundo", "config.json");
    }
    if (process.platform === "win32") {
        const appData = process.env.APPDATA || path_1.default.join(home, "AppData", "Roaming");
        return path_1.default.join(appData, "GloriaMundo", "config.json");
    }
    // Linux / everything else
    return path_1.default.join(home, ".gloriamundo-mcp", "config.json");
}
/** Discover or create the auth token used by the web UI ↔ helper handshake. */
function resolveToken() {
    const configPath = getConfigPath();
    let token = process.env.MCP_HOST_TOKEN;
    if (!token && fs_1.default.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(configPath, "utf-8"));
            if (typeof data.token === "string")
                token = data.token;
        }
        catch {
            /* ignore corrupt JSON */
        }
    }
    if (!token) {
        token = crypto_1.default.randomBytes(32).toString("hex");
        fs_1.default.mkdirSync(path_1.default.dirname(configPath), { recursive: true });
        fs_1.default.writeFileSync(configPath, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2));
    }
    return token;
}
/** Allowed CORS origins for the helper’s HTTP API. */
function resolveAllowedOrigins() {
    const env = process.env.MCP_ALLOWED_ORIGINS;
    return env
        ? env
            .split(",")
            .map((o) => o.trim())
            .filter((o) => o.length > 0)
        : ["https://gloriamundo.com"];
}
