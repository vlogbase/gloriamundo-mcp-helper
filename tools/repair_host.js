const fs = require('fs');

const file = 'src/host.ts';
let s = fs.readFileSync(file, 'utf8');

function findBlock(text, startIdx) {
  let i = text.indexOf('{', startIdx);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        let end = j + 1;
        if (text.slice(end, end + 2) === ');') end += 2;
        return { open: i, end };
      }
    }
  }
  return null;
}

function replaceRoute(regex, newBlock) {
  const m = s.match(regex);
  if (!m) return false;
  const at = m.index;
  const blk = findBlock(s, at + m[0].length - 1);
  if (!blk) throw new Error('Unbalanced braces while replacing a route');
  s = s.slice(0, at) + newBlock + s.slice(blk.end);
  return true;
}

function ensureImportCatalog() {
  if (!/from '\.\/catalog'/.test(s)) {
    // insert just before the first import (best-effort)
    const firstImport = s.indexOf('import ');
    if (firstImport >= 0) {
      s = s.slice(0, firstImport)
        + "import { servers as CATALOG_SERVERS } from './catalog';\n"
        + s.slice(firstImport);
    } else {
      s = "import { servers as CATALOG_SERVERS } from './catalog';\n" + s;
    }
  }
}

function replaceFunction(name, newFnText) {
  const re = new RegExp(`async\\s+function\\s+${name}\\s*\\(`);
  const m = s.match(re);
  if (!m) return false;
  const at = m.index;
  const blk = findBlock(s, at + m[0].length - 1);
  if (!blk) throw new Error(`Unbalanced braces in function ${name}`);
  s = s.slice(0, at) + newFnText + s.slice(blk.end);
  return true;
}

// Canonical blocks (tight, no extra braces)
const VAULT_POST = `
  app.post("/vault/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const value = (req.body && typeof (req.body as any).value === "string")
        ? (req.body as any).value
        : undefined;
      if (!value) return res.status(400).json({ error: "value is required" });
      await setSecret(name, value);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to set secret" });
    }
  });`;

const VAULT_DELETE = `
  app.delete("/vault/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      await deleteSecret(name);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete secret" });
    }
  });`;

const FS_ROUTES = `
  // ---- Filesystem (read-only) ----
  app.get("/v1/fs/list", (req: Request, res: Response) => {
    const dirPath = req.query.path;
    if (typeof dirPath !== "string") {
      return res.status(400).json({ error: "path query parameter is required" });
    }
    try {
      const entries = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
      res.json(entries);
    } catch {
      res.status(400).json({ error: "Failed to read directory" });
    }
  });

  app.get("/v1/fs/get", (req: Request, res: Response) => {
    const filePath = req.query.path;
    if (typeof filePath !== "string") {
      return res.status(400).json({ error: "path query parameter is required" });
    }
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: "Path is a directory" });
      }
      if (stat.size > 128 * 1024) {
        return res.status(400).json({ error: "File too large" });
      }
      const content = fs.readFileSync(filePath, "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(400).json({ error: "Failed to read file" });
    }
  });`;

const CONNECT = `
app.post("/mcp/connect", async (req: Request, res: Response) => {
  try {
    const { serverPath, serverArgs, clientId } = req.body as {
      serverPath: string;
      serverArgs?: string[] | string;
      clientId: string;
    };

    if (!serverPath || !clientId) {
      return res.status(400).json({ error: "serverPath and clientId are required" });
    }

    const rawArgs = Array.isArray(serverArgs)
      ? serverArgs
      : (serverArgs ? [serverArgs] : []);

    let args: string[] = rawArgs;
    try {
      args = await resolveArgs(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to resolve args";
      if (/^Missing secret:/.test(msg)) {
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: "Failed to resolve args" });
    }

    const existing = mcpClients.get(clientId);
    if (existing) {
      try { await (existing as any).close?.(); } catch {}
    }

    const client = await initializeMCPClient(serverPath, args);
    mcpClients.set(clientId, client);
    return res.json({ success: true, clientId });
  } catch (error) {
    return res.status(500).json({ error: "Failed to connect MCP client" });
  }
});`;

const INIT_FN = `async function initializeMCPClient(
  serverPath: string,
  args: string[] = [],
): Promise<Client> {
  const resolvedArgs = await resolveArgs(args);

  const transport = new sdk.StdioClientTransport({
    command: serverPath,
    args: resolvedArgs,
  });

  const client = new sdk.Client(
    { name: "gm-mcp-host", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  await client.connect(transport);
  return client;
}`;

// Apply replacements
ensureImportCatalog();

// replace vault post & delete if present
replaceRoute(/app\.post\("\/vault\/:name"/, VAULT_POST);
replaceRoute(/app\.delete\("\/vault\/:name"/, VAULT_DELETE);

// replace FS region (first /v1/fs/list route)
replaceRoute(/app\.get\("\/v1\/fs\/list"/, FS_ROUTES);

// replace /mcp/connect
replaceRoute(/app\.post\("\/mcp\/connect",\s*async\s*\(req:\s*Request,\s*res:\s*Response\)\s*=>\s*{/, CONNECT);

// normalize initializeMCPClient
replaceFunction('initializeMCPClient', INIT_FN);

// clean obvious paste artefacts
s = s.replace(/\bconst\s+const\s+/g, 'const ');

// final write
fs.writeFileSync(file, s);
console.log('host.ts repaired.');
