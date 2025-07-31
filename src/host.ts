
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Load environment variables
config();

const app = express();
const port = Number(process.env.MCP_HOST_PORT) || 9000;

function getConfigPath(): string {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'GloriaMundo', 'config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'GloriaMundo', 'config.json');
  }
  return path.join(home, '.gloriamundo-mcp', 'config.json');
}

const configPath = getConfigPath();
let token = process.env.MCP_HOST_TOKEN;
if (!token) {
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (data.token) {
        token = data.token;
      }
    } catch {
      // ignore parse errors
    }
  }
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2)
    );
  }
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);

// Middleware
const allowedOrigins = ['https://gloriamundo.com'];

app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// MCP Client management
const mcpClients = new Map<string, Client>();

// Initialize MCP client
async function initializeMCPClient(serverPath: string, serverArgs: string[] = []): Promise<Client> {
  const transport = new StdioClientTransport({
    command: serverPath,
    args: serverArgs,
  });

  const client = new Client(
    {
      name: "gm-mcp-host",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  await client.connect(transport);
  return client;
}

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ ok: true, version: pkg.version, uptime: process.uptime() });
});

app.post('/mcp/connect', async (req: Request, res: Response) => {
  try {
    const { serverPath, serverArgs, clientId } = req.body;
    
    if (!serverPath || !clientId) {
      return res.status(400).json({ error: 'serverPath and clientId are required' });
    }

    const client = await initializeMCPClient(serverPath, serverArgs || []);
    mcpClients.set(clientId, client);

    res.json({ success: true, clientId });
  } catch (error) {
    console.error('Failed to connect MCP client:', error);
    res.status(500).json({ error: 'Failed to connect MCP client' });
  }
});

app.post('/mcp/call/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { method, params } = req.body;

    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'MCP client not found' });
    }

    const result = await client.request({ method, params }, { timeout: 30000 });
    res.json({ success: true, result });
  } catch (error) {
    console.error('MCP call failed:', error);
    res.status(500).json({ error: 'MCP call failed' });
  }
});

app.get('/mcp/tools/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    
    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'MCP client not found' });
    }

    const tools = await client.listTools();
    res.json({ success: true, tools });
  } catch (error) {
    console.error('Failed to list tools:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

app.get('/mcp/resources/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    
    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'MCP client not found' });
    }

    const resources = await client.listResources();
    res.json({ success: true, resources });
  } catch (error) {
    console.error('Failed to list resources:', error);
    res.status(500).json({ error: 'Failed to list resources' });
  }
});

app.delete('/mcp/disconnect/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    
    const client = mcpClients.get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'MCP client not found' });
    }

    await client.close();
    mcpClients.delete(clientId);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect MCP client:', error);
    res.status(500).json({ error: 'Failed to disconnect MCP client' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down MCP host...');
  
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

app.listen(port, '0.0.0.0', () => {
  console.log(`GloriaMundo MCP Host listening on http://localhost:${port}`);
  console.log(
    `MCP token (copy into Account → MCP Host Token): ${token}`
  );
});
