/**
 * CommonJS wrapper so `pkg` can bundle the MCP SDK.
 * It re-exports the helper-friendly build that actually exists on disk:
 *   node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js
 */
module.exports = require(
  '@modelcontextprotocol/sdk/dist/cjs/client'   // ← static CJS path
);
