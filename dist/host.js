"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.PORT = void 0;
const ops_1 = require("./ops");
const catalog_1 = require("./catalog");
const vault_1 = require("./vault");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = require("dotenv");
// Use CommonJS shim so pkg can statically include the SDK
const sdk = require("./sdk-cjs");
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
exports.PORT = Number(process.env.MCP_HOST_PORT) || 9000;
const HOST = process.env.MCP_HOST_BIND || "127.0.0.1";
const token = (0, config_1.resolveToken)();
const allowedOrigins = (0, config_1.resolveAllowedOrigins)();
// version injected at build time via GM_HELPER_VERSION
exports.VERSION = config_1.VERSION;
// Middleware
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin ||
            allowedOrigins.includes(origin) ||
            /^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
            /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
};
app.use((0, cors_1.default)(corsOptions));
app.options("*", (0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/config/public")
        return next();
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});
// MCP Client management
const mcpClients = new Map();
// Initialize MCP client
async function initializeMCPClient(serverPath, args = []) {
    const resolvedArgs = await (0, vault_1.resolveArgs)(args);
    const transport = new sdk.StdioClientTransport({
        command: serverPath,
        args: resolvedArgs,
    });
    const client = new sdk.Client({
        name: "gm-mcp-host",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    await client.connect(transport);
    return client;
}
// Routes
app.get("/health", (req, res) => {
    res.json({ ok: true, version: exports.VERSION, uptime: process.uptime() });
});
app.get("/config/public", (req, res) => {
    res.json({ token, allowedOrigins, configPath: (0, config_1.getConfigPath)() });
});
// ---- Catalog (read-only) ----
app.get("/catalog/servers", (_req, res) => {
    res.json({ servers: catalog_1.servers });
});
// ---- Vault (write/delete only; no read endpoint) ----
app.post("/vault/:name", async (req, res) => {
    try {
        const name = req.params.name;
        const value = (req.body && typeof req.body.value === "string")
            ? req.body.value
            : undefined;
        if (!value)
            return res.status(400).json({ error: "value is required" });
        await (0, vault_1.setSecret)(name, value);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to set secret" });
    }
});
app.delete("/vault/:name", async (req, res) => {
    try {
        const name = req.params.name;
        await (0, vault_1.deleteSecret)(name);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete secret" });
    }
});
// ---- Filesystem (read-only) ----
// ---- Filesystem (read-only) ----
// ---- Catalog (read-only) ----
app.get("/catalog/servers", (_req, res) => {
    res.json({ servers: catalog_1.servers });
});
// ---- Vault (write/delete only; no read endpoint) ----
app.post("/vault/:name", async (req, res) => {
    try {
        const name = req.params.name;
        const value = (req.body && typeof req.body.value === "string")
            ? req.body.value
            : undefined;
        if (!value)
            return res.status(400).json({ error: "value is required" });
        await (0, vault_1.setSecret)(name, value);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({
            error: e instanceof Error ? e.message : "Failed to set secret",
        });
    }
});
app.delete("/vault/:name", async (req, res) => {
    try {
        const name = req.params.name;
        await (0, vault_1.deleteSecret)(name);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({
            error: e instanceof Error ? e.message : "Failed to delete secret",
        });
    }
});
// ---- Filesystem (read-only) ----
app.get("/v1/fs/list", (req, res) => {
    const dirPath = req.query.path;
    if (typeof dirPath !== "string") {
        return res
            .status(400)
            .json({ error: "path query parameter is required" });
    }
    try {
        const entries = fs_1.default
            .readdirSync(dirPath, { withFileTypes: true })
            .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
        res.json(entries);
    }
    catch {
        res.status(400).json({ error: "Failed to read directory" });
    }
});
app.get("/v1/fs/get", (req, res) => {
    const filePath = req.query.path;
    if (typeof filePath !== "string") {
        return res
            .status(400)
            .json({ error: "path query parameter is required" });
    }
    try {
        const stat = fs_1.default.statSync(filePath);
        if (stat.isDirectory()) {
            return res.status(400).json({ error: "Path is a directory" });
        }
        if (stat.size > 128 * 1024) {
            return res.status(400).json({ error: "File too large" });
        }
        const content = fs_1.default.readFileSync(filePath, "utf-8");
        res.type("text/plain").send(content);
    }
    catch {
        res.status(400).json({ error: "Failed to read file" });
    }
});
// ---- MCP (connect/call/list/disconnect) ----
app.post("/mcp/connect", async (req, res) => {
    try {
        const { serverPath, serverArgs, clientId } = req.body;
        if (!serverPath || !clientId) {
            return res
                .status(400)
                .json({ error: "serverPath and clientId are required" });
        }
        const rawArgs = Array.isArray(serverArgs)
            ? serverArgs
            : serverArgs
                ? [serverArgs]
                : [];
        let args = rawArgs;
        try {
            args = await (0, vault_1.resolveArgs)(args);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to resolve args";
            if (/^Missing secret:/.test(msg)) {
                return res.status(400).json({ error: msg });
            }
            return res.status(500).json({ error: "Failed to resolve args" });
        }
        const existing = mcpClients.get(clientId);
        if (existing) {
            try {
                await existing.close?.();
            }
            catch {
                /* ignore */
            }
        }
        const client = await initializeMCPClient(serverPath, args);
        mcpClients.set(clientId, client);
        console.log("MCP client connected:", clientId, serverPath);
        return res.json({ success: true, clientId });
    }
    catch (error) {
        console.error("Failed to connect MCP client:", error);
        return res
            .status(500)
            .json({ error: "Failed to connect MCP client" });
    }
});
app.post("/mcp/call/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const { method, params } = req.body;
        const client = mcpClients.get(clientId);
        if (!client) {
            return res.status(404).json({ error: "MCP client not found" });
        }
        // Minimal compatibility across SDK variants
        let result;
        if (typeof client.callTool === "function") {
            result = await client.callTool({
                name: method,
                arguments: params,
            });
        }
        else if (typeof client.performTool === "function") {
            result = await client.performTool(method, params);
        }
        else {
            throw new Error("MCP SDK: no tool call method");
        }
        res.json({ success: true, result });
    }
    catch (error) {
        console.error("MCP call failed:", error);
        res.status(500).json({
            error: error instanceof Error ? error.message : "MCP call failed",
        });
    }
});
app.get("/mcp/tools/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const client = mcpClients.get(clientId);
        if (!client) {
            return res.status(404).json({ error: "MCP client not found" });
        }
        let tools = [];
        if (typeof client.listTools === "function") {
            tools = await client.listTools();
        }
        res.json({ success: true, tools });
    }
    catch (error) {
        console.error("Failed to list tools:", error);
        res.status(500).json({
            error: error instanceof Error ? error.message : "Failed to list tools",
        });
    }
});
app.get("/mcp/resources/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const client = mcpClients.get(clientId);
        if (!client) {
            return res.status(404).json({ error: "MCP client not found" });
        }
        let resources = [];
        if (typeof client.listResources === "function") {
            resources = await client.listResources();
        }
        res.json({ success: true, resources });
    }
    catch (error) {
        console.error("Failed to list resources:", error);
        res.status(500).json({
            error: error instanceof Error ? error.message : "Failed to list resources",
        });
    }
});
app.delete("/mcp/disconnect/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const client = mcpClients.get(clientId);
        if (!client) {
            return res.status(404).json({ error: "MCP client not found" });
        }
        try {
            await client.close?.();
        }
        catch {
            /* ignore */
        }
        mcpClients.delete(clientId);
        console.log("MCP client disconnected:", clientId);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Failed to disconnect MCP client:", error);
        res.status(500).json({
            error: error instanceof Error
                ? error.message
                : "Failed to disconnect MCP client",
        });
    }
});
process.on("SIGINT", async () => {
    console.log("Shutting down MCP host...");
    for (const [clientId, client] of mcpClients) {
        try {
            await client.close();
            console.log(`Closed MCP client: ${clientId}`);
        }
        catch (error) {
            console.error(`Error closing MCP client ${clientId}:`, error);
        }
    }
    process.exit(0);
});
// Mount production ops endpoints
(0, ops_1.installOps)(app);
app.listen(exports.PORT, HOST, () => {
    console.log(`GloriaMundo MCP Host listening on http://localhost:${exports.PORT}`);
    console.log(`MCP token (for manual pairing if needed): ${token}`);
});
