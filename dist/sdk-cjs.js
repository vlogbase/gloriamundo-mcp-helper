"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Minimal CJS shim for @modelcontextprotocol/sdk.
 * Works whether package.json is the package root or already in dist/cjs.
 * Exports: { Client, StdioClientTransport }
 */
const node_path_1 = require("node:path");
function tryReq(id) { try {
    return require(id);
}
catch {
    return null;
} }
function endsWithDistCjs(p) {
    return /[\\/](dist[\\/])?cjs[\\/]?$/.test(p) || /[\\/]dist[\\/]cjs$/.test(p);
}
function resolveCjsBase() {
    const pkg = require.resolve('@modelcontextprotocol/sdk/package.json');
    const dir = (0, node_path_1.dirname)(pkg);
    // If package.json is already under dist/cjs, use that as the base
    if (dir.endsWith('dist/cjs') || dir.endsWith('dist\\cjs'))
        return dir;
    // Otherwise, try common layout: <pkgRoot>/dist/cjs
    return (0, node_path_1.join)(dir, 'dist', 'cjs');
}
const base = resolveCjsBase();
// Candidates for Client (module may export class directly or under .Client)
const clientPaths = [
    (0, node_path_1.join)(base, 'client', 'index.js'),
    (0, node_path_1.join)(base, 'client', 'index.cjs'),
    (0, node_path_1.join)(base, 'client.js'),
    (0, node_path_1.join)(base, 'index.js'),
    (0, node_path_1.join)(base, 'index.cjs'),
];
let Client = null;
for (const p of clientPaths) {
    const mod = tryReq(p);
    if (!mod)
        continue;
    if (mod.Client) {
        Client = mod.Client;
        break;
    }
    if (typeof mod === 'function') {
        Client = mod;
        break;
    }
}
// Candidates for StdioClientTransport (some builds default-export it)
const stdioPaths = [
    (0, node_path_1.join)(base, 'client', 'transport', 'stdio.js'),
    (0, node_path_1.join)(base, 'client', 'transport', 'stdio.cjs'),
    (0, node_path_1.join)(base, 'transport', 'stdio.js'),
    (0, node_path_1.join)(base, 'transport', 'stdio.cjs'),
    (0, node_path_1.join)(base, 'client', 'stdio.js'),
    (0, node_path_1.join)(base, 'client', 'stdio.cjs'),
];
let StdioClientTransport = null;
for (const p of stdioPaths) {
    const mod = tryReq(p);
    if (!mod)
        continue;
    if (mod.StdioClientTransport) {
        StdioClientTransport = mod.StdioClientTransport;
        break;
    }
    if (typeof mod === 'function') {
        StdioClientTransport = mod;
        break;
    }
}
if (!Client || !StdioClientTransport) {
    let pkgPath = '';
    try {
        pkgPath = require.resolve('@modelcontextprotocol/sdk/package.json');
    }
    catch { }
    throw new Error('Could not load MCP SDK Client and/or StdioClientTransport.\n' +
        (pkgPath ? `SDK package.json: ${pkgPath}\n` : '') +
        `CJS base: ${base}\n` +
        `Resolved: Client=${!!Client}, StdioClientTransport=${!!StdioClientTransport}`);
}
module.exports = { Client, StdioClientTransport };
