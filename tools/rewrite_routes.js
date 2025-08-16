// tools/rewrite_routes.js
// Canonical rewrite for route region + initializeMCPClient in src/host.ts
// - Adds imports for catalog + vault if missing
// - Replaces the entire routes region (Catalog -> MCP disconnect) with known-good code
// - Normalizes initializeMCPClient(serverPath, args) to resolve args inside the function

const fs = require("fs");
const FILE = "src/host.ts";

function read() {
  return fs.readFileSync(FILE, "utf8");
}
function write(s) {
  fs.writeFileSync(FILE, s);
}

function hasImport(src, modPath) {
  const re = new RegExp(String.raw`from\s+['"]${modPath}['"]`);
  return re.test(src);
}

function insertImportIfMissing(src, importLine, modPath) {
  if (hasImport(src, modPath)) return src;
  const m = src.match(/^import .*$/m);
  if (m) {
    const i = m.index;
    return src.slice(0, i) + importLine + "\n" + src.slice(i);
  }
  return importLine + "\n" + src;
}


function findBalancedBlock(src, startIdx) {
  // Start from first '{' after startIdx; return [blockStartBraceIdx, blockEndIdxExclusive]
  const open = src.indexOf("{", startIdx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        // include following ');' if present
        let end = i + 1;
        if (src.slice(end, end + 2) === ");") end += 2;
        return [open, end];
      }
    }
  }
  return null; // unbalanced
}

function replaceFunctionByName(src, fnName, newBody) {
  // Find "async function <name>(" then replace balanced block
  const start = src.search(new RegExp(`async\\s+function\\s+${fnName}\\s*\\(`));
  if (start < 0) return src; // not found; don't throw, just skip
  const blk = findBalancedBlock(src, start);
  if (!blk)
    throw new Error(`Unbalanced function body while replacing ${fnName}`);
  const [blockStart, blockEndEx] = blk;
  return src.slice(0, start) + newBody + src.slice(blockEndEx);
}

function replaceRoutesRegion(src, canonical) {
  // Boundaries:
  //   - Start: prefer the "Catalog" comment or the catalog route
  //   - End:   prefer the "Graceful shutdown" comment or the SIGINT handler
  let startIdx =
    src.indexOf("\n  // ---- Catalog (read-only) ----") >= 0
      ? src.indexOf("\n  // ---- Catalog (read-only) ----")
      : src.indexOf('\n  app.get("/catalog/servers"');

  if (startIdx < 0) {
    // Fallback: start at first of vault/fs/mcp routes
    const candidates = [
      '\n  app.post("/vault/:name"',
      '\n  app.get("/v1/fs/list"',
      '\n  app.post("/mcp/connect"',
    ]
      .map((lit) => src.indexOf(lit))
      .filter((i) => i >= 0);
    if (!candidates.length) {
      throw new Error("Could not find start of routes region.");
    }
    startIdx = Math.min(...candidates);
  }

  let endIdx =
    src.indexOf("\n  // Graceful shutdown") >= 0
      ? src.indexOf("\n  // Graceful shutdown")
      : src.indexOf('process.on("SIGINT"');

  if (endIdx < 0) throw new Error("Could not find end of routes region.");

  // Keep a preceding newline at start and preserve end anchor
  const before = src.slice(0, startIdx);
  const after = src.slice(endIdx);

  return before + "\n" + canonical.trimEnd() + "\n" + after;
}

// ---------- load file ----------
let s = read();

// ---------- ensure imports ----------
s = insertImportIfMissing(
  s,
  'import { servers as CATALOG_SERVERS } from "./catalog";',
  "./catalog"
);
s = insertImportIfMissing(
  s,
  'import { setSecret, deleteSecret, resolveArgs } from "./vault";',
  "./vault"
);

// ---------- normalize initializeMCPClient ----------
const initFnCanon = `
  async function initializeMCPClient(
    serverPath: string,
    args: string[] = [],
  ): Promise<Client> {
    const resolvedArgs = await resolveArgs(args);

    const transport = new sdk.StdioClientTransport({
      command: serverPath,
      args: resolvedArgs,
    });

    const client = new sdk.Client(
      {
        name: "gm-mcp-host",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    await client.connect(transport);
    return client;
  }
`;

s = replaceFunctionByName(s, "initializeMCPClient", initFnCanon);

// ---------- canonical routes region ----------
const routesCanon = `
  // ---- Catalog (read-only) ----
  app.get("/catalog/servers", (_req: Request, res: Response) => {
    res.json({ servers: CATALOG_SERVERS });
  });

  // ---- Vault (write/delete only; no read endpoint) ----
  app.post("/vault/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const value =
        (req.body && typeof (req.body as any).value === "string")
          ? (req.body as any).value
          : undefined;
      if (!value) return res.status(400).json({ error: "value is required" });
      await setSecret(name, value);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to set secret",
      });
    }
  });

  app.delete("/vault/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      await deleteSecret(name);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to delete secret",
      });
    }
  });

  // ---- Filesystem (read-only) ----
  app.get("/v1/fs/list", (req: Request, res: Response) => {
    const dirPath = req.query.path;
    if (typeof dirPath !== "string") {
      return res
        .status(400)
        .json({ error: "path query parameter is required" });
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
      return res
        .status(400)
        .json({ error: "path query parameter is required" });
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
  });

  // ---- MCP (connect/call/list/disconnect) ----
  app.post("/mcp/connect", async (req: Request, res: Response) => {
    try {
      const { serverPath, serverArgs, clientId } = req.body as {
        serverPath: string;
        serverArgs?: string[] | string;
        clientId: string;
      };

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
        try {
          await (existing as any).close?.();
        } catch {
          /* ignore */
        }
      }

      const client = await initializeMCPClient(serverPath, args);
      mcpClients.set(clientId, client);
      console.log("MCP client connected:", clientId, serverPath);
      return res.json({ success: true, clientId });
    } catch (error) {
      console.error("Failed to connect MCP client:", error);
      return res
        .status(500)
        .json({ error: "Failed to connect MCP client" });
    }
  });

  app.post("/mcp/call/:clientId", async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const { method, params } = req.body as { method: string; params?: any };

      const client = mcpClients.get(clientId);
      if (!client) {
        return res.status(404).json({ error: "MCP client not found" });
      }

      // Minimal compatibility across SDK variants
      let result: any;
      if (typeof (client as any).callTool === "function") {
        result = await (client as any).callTool({
          name: method,
          arguments: params,
        });
      } else if (typeof (client as any).performTool === "function") {
        result = await (client as any).performTool(method, params);
      } else {
        throw new Error("MCP SDK: no tool call method");
      }

      res.json({ success: true, result });
    } catch (error) {
      console.error("MCP call failed:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "MCP call failed",
      });
    }
  });

  app.get("/mcp/tools/:clientId", async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const client = mcpClients.get(clientId);
      if (!client) {
        return res.status(404).json({ error: "MCP client not found" });
      }
      let tools: any = [];
      if (typeof (client as any).listTools === "function") {
        tools = await (client as any).listTools();
      }
      res.json({ success: true, tools });
    } catch (error) {
      console.error("Failed to list tools:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to list tools",
      });
    }
  });

  app.get("/mcp/resources/:clientId", async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const client = mcpClients.get(clientId);
      if (!client) {
        return res.status(404).json({ error: "MCP client not found" });
      }
      let resources: any = [];
      if (typeof (client as any).listResources === "function") {
        resources = await (client as any).listResources();
      }
      res.json({ success: true, resources });
    } catch (error) {
      console.error("Failed to list resources:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to list resources",
      });
    }
  });

  app.delete("/mcp/disconnect/:clientId", async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const client = mcpClients.get(clientId);
      if (!client) {
        return res.status(404).json({ error: "MCP client not found" });
      }
      try {
        await (client as any).close?.();
      } catch {
        /* ignore */
      }
      mcpClients.delete(clientId);
      console.log("MCP client disconnected:", clientId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to disconnect MCP client:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to disconnect MCP client",
      });
    }
  });
`;

s = replaceRoutesRegion(s, routesCanon);

// Minor cleanup: if any accidental "const const" slipped in previously
s = s.replace(/\bconst\s+const\s+/g, "const ");

// Write back
write(s);
console.log("✅ Rewrote imports, initializeMCPClient, and the routes region.");
