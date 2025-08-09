/**
 * CommonJS shim for @modelcontextprotocol/sdk client.
 * Locate the CJS build by inspecting the installed package.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function tryRequire(id: string) {
  try { return require(id); } catch { return null; }
}

let client: any = null;

// 1) Try direct CJS exports if the package maps them.
const directCandidates = [
  '@modelcontextprotocol/sdk/client',
  '@modelcontextprotocol/sdk/client/index.js',
];
for (const id of directCandidates) {
  const m = tryRequire(id);
  if (m) { client = m; break; }
}

// 2) Otherwise, derive the CJS base dir: .../sdk/dist/cjs/
let cjsBase = '';
if (!client) {
  try {
    const pkgCjs = require.resolve('@modelcontextprotocol/sdk/dist/cjs/package.json');
    cjsBase = dirname(pkgCjs);
  } catch {
    try {
      const pkgRoot = dirname(require.resolve('@modelcontextprotocol/sdk/package.json'));
      cjsBase = join(pkgRoot, 'dist', 'cjs');
    } catch {
      cjsBase = '';
    }
  }

  if (cjsBase) {
    const pathCandidates = [
      join(cjsBase, 'client', 'index.cjs'),
      join(cjsBase, 'client', 'index.js'),
      join(cjsBase, 'client.cjs'),
      join(cjsBase, 'client.js'),
      join(cjsBase, 'index.cjs'),
      join(cjsBase, 'index.js'),
    ];
    for (const p of pathCandidates) {
      if (existsSync(p)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        client = require(p);
        break;
      }
    }
  }
}

// 3) If still not found, throw a detailed error.
if (!client) {
  let pkgPath = '';
  try { pkgPath = require.resolve('@modelcontextprotocol/sdk/package.json'); } catch {}
  throw new Error(
    'Could not load MCP SDK client via CJS.\n' +
    'Checked direct ids and common dist/cjs paths.\n' +
    (pkgPath ? `SDK package.json resolved at: ${pkgPath}` : '')
  );
}

module.exports = client;
