
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Load environment variables
config();

const app = express();
const port = process.env.MCP_HOST_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/mcp/connect', async (req, res) => {
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

app.post('/mcp/call/:clientId', async (req, res) => {
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

app.get('/mcp/tools/:clientId', async (req, res) => {
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

app.get('/mcp/resources/:clientId', async (req, res) => {
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

app.delete('/mcp/disconnect/:clientId', async (req, res) => {
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
  console.log(`MCP Host server running on port ${port}`);
});
