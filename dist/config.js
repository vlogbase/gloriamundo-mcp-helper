"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigPath = getConfigPath;
exports.resolveToken = resolveToken;
exports.resolveAllowedOrigins = resolveAllowedOrigins;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
function getConfigPath() {
    const home = os_1.default.homedir();
    if (process.platform === 'darwin') {
        return path_1.default.join(home, 'Library', 'Application Support', 'GloriaMundo', 'config.json');
    }
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path_1.default.join(home, 'AppData', 'Roaming');
        return path_1.default.join(appData, 'GloriaMundo', 'config.json');
    }
    return path_1.default.join(home, '.gloriamundo-mcp', 'config.json');
}
function resolveToken() {
    const configPath = getConfigPath();
    let token = process.env.MCP_HOST_TOKEN;
    if (!token && fs_1.default.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
            if (typeof data.token === 'string') {
                token = data.token;
            }
        }
        catch {
            // ignore parse errors
        }
    }
    if (!token) {
        token = crypto_1.default.randomBytes(32).toString('hex');
        fs_1.default.mkdirSync(path_1.default.dirname(configPath), { recursive: true });
        fs_1.default.writeFileSync(configPath, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2));
    }
    return token;
}
function resolveAllowedOrigins() {
    const env = process.env.MCP_ALLOWED_ORIGINS;
    if (!env) {
        return ['https://gloriamundo.com'];
    }
    return env
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
}
