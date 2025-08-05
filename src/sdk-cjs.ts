// desktop/host/src/sdk-cjs.ts

/**
 * CommonJS wrapper so the helper can bundle the MCP SDK.
 * We re-export the real CJS build that lives inside dist/cjs/client/.
 */
module.exports = require("@modelcontextprotocol/sdk/dist/cjs/client");
