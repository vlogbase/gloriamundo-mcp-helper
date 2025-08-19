import express from "express";
import fs from "fs";
import os from "os";
import path from "path";

// ---- config/token helpers ---------------------------------------------------

function configPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library/Application Support/GloriaMundo/config.json");
    case "win32":
      return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "GloriaMundo", "config.json");
    default:
      return path.join(home, ".gloriamundo-mcp", "config.json");
  }
}

function loadToken(): string | undefined {
  const env = (process.env.MCP_HOST_TOKEN || "").trim();
  if (env) return env;
  try {
    const p = configPath();
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    if (j && typeof j.token === "string" && j.token.trim()) return j.token.trim();
  } catch {}
  return undefined;
}

function requireAuth(): express.RequestHandler {
  const token = loadToken();
  return (req, res, next) => {
    if (!token) return res.status(503).json({ error: "helper token is not initialized yet" });
    const auth = req.get("authorization") || req.get("Authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const presented = m ? m[1] : (req.get("X-Api-Key") || req.get("x-api-key") || "");
    if (presented === token) return next();
    return res.status(401).json({ error: "unauthorized" });
  };
}

// ---- tiny vault -------------------------------------------------------------

const vaultFile = path.join(os.homedir(), ".gloriamundo-mcp", "vault.json");

function readVault(): Record<string, string> {
  try {
    const raw = fs.readFileSync(vaultFile, "utf8");
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j as Record<string, string>;
  } catch {}
  return {};
}

function writeVault(v: Record<string, string>): void {
  const dir = path.dirname(vaultFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(vaultFile, JSON.stringify(v, null, 2), "utf8");
}

// ---- router -----------------------------------------------------------------

const router = express.Router();

// ensure JSON parsing for these routes
router.use(express.json({ limit: "1mb" }));

router.get("/healthz", requireAuth(), (_req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    uptimeSec: process.uptime(),
    node: process.version,
    env: process.env.NODE_ENV || "prod",
  });
});

router.get("/catalog/servers", requireAuth(), (_req, res) => {
  res.json({
    servers: [
      {
        id: "filesystem",
        name: "Filesystem",
        description: "Access local files via MCP",
        homepage: "https://github.com/modelcontextprotocol/server-filesystem",
        examplePath: "npx -y @modelcontextprotocol/server-filesystem",
        exampleArgs: ["--root", "."],
      },
      {
        id: "github-pr",
        name: "GitHub PR helper",
        description: "Interact with GitHub pull requests",
        homepage: "https://github.com/modelcontextprotocol",
        examplePath: "npx -y mcp-server-github-pr",
        exampleArgs: ["--token", "{{SECRET:GITHUB_TOKEN}}"],
      },
      {
        id: "slack",
        name: "Slack poster",
        description: "Send messages to Slack channels",
        homepage: "https://github.com/modelcontextprotocol",
        examplePath: "npx -y mcp-server-slack",
        exampleArgs: ["--token", "{{SECRET:SLACK_TOKEN}}"],
      },
      {
        id: "http",
        name: "HTTP requester",
        description: "Perform HTTP requests via MCP",
        homepage: "https://github.com/modelcontextprotocol",
        examplePath: "npx -y mcp-server-http",
        exampleArgs: [],
      },
    ],
  });
});

// Read-only directory listing with root guard; accepts absolute or relative path
router.get("/fs/list", requireAuth(), (req: express.Request, res: express.Response) => {
  try {
    const ROOT = process.env.MCP_FS_ROOT || process.cwd();
    const rootAbs = path.resolve(ROOT); // canonical absolute
    const q = String(req.query.path ?? "").trim();
    if (!q) return res.status(400).json({ error: "missing path", root: rootAbs });

    // allow absolute or relative input
    const candidate = path.isAbsolute(q) ? q : path.join(rootAbs, q);
    const abs = path.resolve(candidate);

    // forbid escaping root
    const rootWithSep = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
    if (!(abs === rootAbs || abs.startsWith(rootWithSep))) {
      return res.status(400).json({ error: "path must be inside root", root: rootAbs, path: abs });
    }

    const st = fs.statSync(abs);
    if (!st.isDirectory()) {
      return res.json({ root: rootAbs, path: abs, type: "file", size: st.size });
    }

    const entries = fs.readdirSync(abs).map((name) => {
      const p = path.join(abs, name);
      const s = fs.statSync(p);
      return { name, path: p, isDir: s.isDirectory(), size: s.size };
    });

    res.json({ root: rootAbs, path: abs, entries });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// minimal vault API
router.post("/vault/:name", requireAuth(), (req, res) => {
  try {
    const name = String(req.params.name || "").trim();
    if (!name) return res.status(400).json({ error: "missing name" });
    const value = String((req.body?.value ?? "")).trim();
    if (!value) return res.status(400).json({ error: "missing value" });

    const v = readVault();
    v[name] = value;
    writeVault(v);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

router.get("/vault/:name", requireAuth(), (req, res) => {
  const name = String(req.params.name || "").trim();
  const v = readVault();
  if (!(name in v)) return res.status(404).json({ error: "not found" });
  res.json({ name, value: v[name], success: true });
});

// Host expects a named export installOps(app) — provide it:
export function installOps(app: express.Express) {
  app.use(router);
}

// Also provide default export in case we want app.use(opsRouter) elsewhere
export default router;
