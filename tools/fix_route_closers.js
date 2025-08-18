const fs = require('fs');

const FILE = 'src/host.ts';
let s = fs.readFileSync(FILE, 'utf8');

function findRouteBodyBounds(src, startIndex) {
  // Find the handler's opening "{"
  const arrow = src.indexOf('=>', startIndex);
  if (arrow < 0) return null;
  const open = src.indexOf('{', arrow);
  if (open < 0) return null;

  // Balance braces to find the route body closing "}"
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null; // unbalanced

  // i is position of the route body's closing '}'
  // Often immediately followed by ');'
  return { open, close: i };
}

function ensureInnerCatchClosed(src, routeStartLiteral, label) {
  const idx = src.indexOf(routeStartLiteral);
  if (idx < 0) {
    console.log(`- ${label}: not found (skipped)`);
    return src;
  }
  const bounds = findRouteBodyBounds(src, idx);
  if (!bounds) {
    console.log(`- ${label}: unbalanced (skipped)`);
    return src;
  }

  // Look at the end of the body, just before the closing "}"
  const lookBehind = 180; // window to inspect before the route "}"
  const startWin = Math.max(bounds.close - lookBehind, 0);
  const tail = src.slice(startWin, bounds.close);

  // If the last non-space char before route "}" is NOT '}', we need to add one.
  const tailTrim = tail.replace(/\s+$/,''); // drop trailing whitespace
  const lastChar = tailTrim[tailTrim.length - 1];

  if (lastChar !== '}') {
    // Insert a standalone "}" on its own line, preserving the current indentation level.
    // Infer indentation from the line that contains the route closing brace.
    const lineStart = src.lastIndexOf('\n', bounds.close) + 1;
    const lineIndent = src.slice(lineStart, bounds.close).match(/^\s*/)[0] ?? '';
    const insert = `\n${lineIndent}}`;

    src = src.slice(0, bounds.close) + insert + src.slice(bounds.close);
    console.log(`✓ ${label}: inserted missing '}' before route closer`);
  } else {
    console.log(`✓ ${label}: already closed`);
  }

  return src;
}

const ROUTES = [
  ['app.get("/v1/fs/list"',       'GET /v1/fs/list'],
  ['app.get("/v1/fs/get"',        'GET /v1/fs/get'],
  ['app.post("/mcp/connect"',     'POST /mcp/connect'],
  ['app.post("/mcp/call/:clientId"', 'POST /mcp/call/:clientId'],
  ['app.get("/mcp/tools/:clientId"', 'GET /mcp/tools/:clientId'],
  ['app.get("/mcp/resources/:clientId"', 'GET /mcp/resources/:clientId'],
  ['app.delete("/mcp/disconnect/:clientId"', 'DELETE /mcp/disconnect/:clientId'],
  ['app.post("/vault/:name"',     'POST /vault/:name'],
  ['app.delete("/vault/:name"',   'DELETE /vault/:name'],
];

for (const [lit, label] of ROUTES) {
  s = ensureInnerCatchClosed(s, lit, label);
}

fs.writeFileSync(FILE, s);
console.log('Done: route catch/closers normalized.');
