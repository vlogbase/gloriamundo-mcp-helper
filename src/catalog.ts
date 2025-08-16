export interface ServerDescriptor {
  id: string;
  name: string;
  description: string;
  homepage: string;
  examplePath: string;
  exampleArgs: string[];
}

export const servers: ServerDescriptor[] = [
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
];

