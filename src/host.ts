
import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

dotenv.config();

const PORT = 9000;
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const TOKEN = process.env.MCP_HOST_TOKEN || '';

const app = express();
app.use(express.json());
const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

app.use((req: Request, res: Response, next: NextFunction) => {
  if (TOKEN) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  next();
});

interface ServerEntry {
  transport: StdioClientTransport;
  client: Client;
}

const servers: Record<string, ServerEntry> = {};

async function startServer(id: string): Promise<ServerEntry> {
  if (servers[id]) return servers[id];

  if (id !== 'filesystem') {
    throw new Error(`unknown server ${id}`);
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '--root', process.cwd()],
    stderr: 'pipe'
  });
  await transport.start();
  transport.stderr?.on('data', d => console.error(`[${id} err]`, d.toString()));
  transport.onclose = () => {
    console.error(`${id} exited, restarting`);
    delete servers[id];
    setTimeout(() => {
      startServer(id).catch(err => console.error('restart failed', err));
    }, 1000);
  };
  const client = new Client({ name: 'gm-host', version: '0.1.0' });
  await client.connect(transport);
  const entry = { transport, client };
  servers[id] = entry;
  return entry;
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, servers: Object.keys(servers) });
});

app.post('/servers/:id/start', async (req: Request, res: Response) => {
  try {
    await startServer(req.params.id);
    res.json({ started: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/mcp/call', async (req: Request, res: Response) => {
  const { serverId, toolName, params } = req.body as { serverId: string; toolName: string; params: any };
  const entry = servers[serverId];
  if (!entry) {
    return res.status(404).json({ error: 'server not running' });
  }
  try {
    const result = await entry.client.callTool({ name: toolName, arguments: params });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MCP host listening on ${PORT}`);
});

// TODO: code-signing
// TODO: auto-update
// TODO: OAuth credential manager
// TODO: server store UI
