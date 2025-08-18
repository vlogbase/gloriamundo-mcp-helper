import express from "express";
import fs from "fs";
import os from "os";
import path from "path";

/** Resolve config file path similar to README */
function configPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin": return path.join(home, "Library/Application Support/GloriaMundo/config.json");
    case "win32":  return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "GloriaMundo", "config.json");
    default:       return path.join(home, ".gloriamundo-mcp", "config.json");
  }
}

/** Load token from env or config file */
function loadToken(): string | undefined {
  if (process.env.MCP_HOST_TOKEN && process.env.MCP_HOST_TOKEN.trim()) {
    return process.env.MCP_HOST_TOKEN.trim();
  }
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
    const h = req.get("authorization") || req.get("Authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    const presented = m ? m[1] : (req.get("X-Api-Key") || req.get("x-api-key") || "");
    if (presented === token) return next();
    return res.status(401).json({ error: "unauthorized" });
  };
}

/** tiny file-backed vault at ~/.gloriamundo-mcp/vault.json */
const vaultStorePath = path.join(os.homedir(), ".gloriamundo-mcp", "vault.json");
function readVault(): Record<string,string> {
  try {
    const s = fs.readFileSync(vaultStorePath, "utf8");
    const j = JSON.parse(s);
    if (j && typeof j === "object") return j;
  } catch {}
  return {};
}
function writeVault(obj: Record<string,string>) {
  fs.mkdirSync(path.dirname(vaultStorePath), { recursive: true });
  fs.writeFileSync(vaultStorePath, JSON.stringify(obj, null, 2), { encoding: "utf8" });
}

/** secure join under a root */
function safeJoin(root: string, rel: string) {
  const cleaned = rel.replace(/^[\\/]+/, "");
  const abs = path.resolve(root, cleaned);
  const normRoot = path.resolve(root) + path.sep;
  if (!abs.startsWith(normRoot)) throw new Error("path escapes root");
  return abs;
}

/** mount all ops endpoints */
export function installOps(app: express.Express) {
  const router = express.Router();
  const auth = requireAuth();

  // Health
  router.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      uptimeSec: process.uptime(),
      node: process.version,
      env: "prod",
    });
  });

  // Catalog of local helper-backed servers
  router.get("/catalog/servers", (_req, res) => {
    res.json({
      servers: [
        { id: "vault", name: "Local Secret Vault", kind: "vault", basePath: "/vault" },
        { id: "fs",    name: "Local Filesystem",   kind: "fs",    basePath: "/fs"    },
      ],
    });
  });

  // Vault (auth)
  router.post("/vault/:name", auth, (req, res) => {
    const name = String(req.params.name || "").trim();
    const value = req.body?.value;
    if (!name) return res.status(400).json({ error: "name required" });
    if (typeof value !== "string") return res.status(400).json({ error: "value (string) required" });
    const store = readVault();
    store[name] = value;
    writeVault(store);
    res.json({ ok: true });
  });

  router.delete("/vault/:name", auth, (req, res) => {
    const name = String(req.params.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });
    const store = readVault();
    if (store[name] !== undefined) {
      delete store[name];
      writeVault(store);
    }
    res.json({ ok: true });
  });

  // Optional: read (auth) — handy for diagnostics
  router.get("/vault/:name", auth, (req, res) => {
    const name = String(req.params.name || "").trim();
    const store = readVault();
    if (store[name] === undefined) return res.status(404).json({ error: "not found" });
    res.json({ name, value: store[name] });
  });

  // Read-only FS
  const FS_ROOT = process.env.MCP_FS_ROOT || process.cwd();
  const MAX_READ = Number(process.env.MCP_FS_MAX_READ_BYTES || 1024 * 1024); // 1MB default

  router.get("/fs/list", (req, res) => {
    const rel = String((req.query.path ?? req.query.p ?? "") || ".");
    try {
      const root = path.resolve(FS_ROOT);
      const abs = safeJoin(root, rel);
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) return res.status(400).json({ error: "not a directory" });
      const ents = fs.readdirSync(abs, { withFileTypes: true }).map(d => ({
        name: d.name,
        type: d.isDirectory() ? "dir" : d.isFile() ? "file" : "other"
      }));
      res.json({ root, path: path.relative(root, abs) || ".", entries: ents });
    } catch (e:any) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.get("/fs/read", (req, res) => {
    const rel = String((req.query.path ?? req.query.p ?? "") || "");
    if (!rel) return res.status(400).json({ error: "path required" });
    try {
      const root = path.resolve(FS_ROOT);
      const abs = safeJoin(root, rel);
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return res.status(400).json({ error: "not a file" });
      if (stat.size > MAX_READ) return res.status(413).json({ error: "file too large", size: stat.size, max: MAX_READ });
      const buf = fs.readFileSync(abs);
      res.json({ path: path.relative(root, abs), size: buf.length, encoding: "base64", data: buf.toString("base64") });
    } catch (e:any) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.use(router);
}
