import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "dotenv";
import { z } from "zod";
import path from "path";

/* ------------------------------------------------------------------------- *
 * NOTE(pkg): the top-level entry of @modelcontextprotocol/sdk is pure ESM
 * and has no "main"/"exports" field that the pkg bundler understands.
 * We therefore point Node at the CommonJS browser-friendly build instead,
 * which lives under sdk/client/.  This lets pkg include it without hacks.
 * ------------------------------------------------------------------------- */
// pkg bundles relative requires best when we resolve from __dirname
const sdk = require("./sdk-cjs");
type Client = InstanceType<typeof sdk.Client>;

import fs from "fs";
import { getConfigPath, resolveAllowedOrigins, resolveToken } from "./config";

// Load environment variables
config();

const app = express();
export const PORT = Number(process.env.MCP_HOST_PORT) || 9000;
const token = resolveToken();
const allowedOrigins = resolveAllowedOrigins();

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
);
export const VERSION = pkg.version;

// Middleware
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/config/public") return next();
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// MCP Client management
const mcpClients = new Map<string, Client>();

// Initialize MCP client
async function initializeMCPClient(
  serverPath: string,
  serverArgs: string[] = [],
): Promise<Client> {
  const transport = new sdk.StdioClientTransport({
    command: serverPath,
    args: serverArgs,
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

// Routes
app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true, version: VERSION, uptime: process.uptime() });
});

app.get("/config/public", (req: Request, res: Response) => {
  res.json({ token, allowedOrigins, configPath: getConfigPath() });
});

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
});

app.post("/mcp/connect", async (req: Request, res: Response) => {
  try {
    const { serverPath, serverArgs, clientId } = req.body;

    if (!serverPath || !clientId) {
      return res
        .status(400)
        .json({ error: "serverPath and clientId are required" });
    }

    const client = await initializeMCPClient(serverPath, serverArgs || []);
    mcpClients.set(clientId, client);

    res.json({ success: true, clientId });
  } catch (error) {
    console.error("Failed to connect MCP client:", error);
    res.status(500).json({ error: "Failed to connect MCP client" });
  }
});

app.post("/mcp/call/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { method, params } = req.body;

    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: "MCP client not found" });
    }

    // Version-agnostic timeout wrapper. Some SDK versions don't accept an options arg.
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const id = setTimeout(() => {
          reject(new Error(`MCP request timed out after ${ms}ms`));
        }, ms);
        p.then(
          (val) => {
            clearTimeout(id);
            resolve(val);
          },
          (err) => {
            clearTimeout(id);
            reject(err);
          },
        );
      });

    // Provide a permissive schema: any object shape is accepted.
    const resultSchema = z.object({}).passthrough();

    // New call: request + schema (+ optional options if your SDK supports them).
    // If your SDK version doesn't take a third argument, remove the options object.
    const result = await withTimeout(
      client.request(
        { method, params } as any,
        resultSchema,
        // , { timeout: 30_000 } // uncomment only if your SDK version supports RequestOptions
      ),
      30000,
    );
    res.json({ success: true, result });
  } catch (error) {
    console.error("MCP call failed:", error);
    res.status(500).json({ error: "MCP call failed" });
  }
});

app.get("/mcp/tools/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: "MCP client not found" });
    }

    const tools = await client.listTools();
    res.json({ success: true, tools });
  } catch (error) {
    console.error("Failed to list tools:", error);
    res.status(500).json({ error: "Failed to list tools" });
  }
});

app.get("/mcp/resources/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: "MCP client not found" });
    }

    const resources = await client.listResources();
    res.json({ success: true, resources });
  } catch (error) {
    console.error("Failed to list resources:", error);
    res.status(500).json({ error: "Failed to list resources" });
  }
});

app.delete("/mcp/disconnect/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: "MCP client not found" });
    }

    await client.close();
    mcpClients.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to disconnect MCP client:", error);
    res.status(500).json({ error: "Failed to disconnect MCP client" });
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down MCP host...");

  for (const [clientId, client] of mcpClients) {
    try {
      await client.close();
      console.log(`Closed MCP client: ${clientId}`);
    } catch (error) {
      console.error(`Error closing MCP client ${clientId}:`, error);
    }
  }

  process.exit(0);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`GloriaMundo MCP Host listening on http://localhost:${PORT}`);
  console.log(`MCP token (copy into Account → MCP Host Token): ${token}`);
});
