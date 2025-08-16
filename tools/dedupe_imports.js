// tools/dedupe_imports.js
// Remove duplicate import lines for ./vault and ./catalog (single or double quotes), keep the first.

const fs = require("fs");
const file = "src/host.ts";
let s = fs.readFileSync(file, "utf8");

// Normalise line endings for line-by-line processing
const lines = s.split(/\r?\n/);

const seen = {
  vault: false,
  catalog: false,
};

function isVaultImport(line) {
  return /^\s*import\s+\{[^}]*\}\s+from\s+['"]\.\/vault['"]\s*;?\s*$/.test(
    line,
  );
}
function isCatalogImport(line) {
  return /^\s*import\s+\{[^}]*\}\s+from\s+['"]\.\/catalog['"]\s*;?\s*$/.test(
    line,
  );
}

const out = [];
for (const line of lines) {
  if (isVaultImport(line)) {
    if (seen.vault) continue;
    seen.vault = true;
  } else if (isCatalogImport(line)) {
    if (seen.catalog) continue;
    seen.catalog = true;
  }
  out.push(line);
}

fs.writeFileSync(file, out.join("\n"));
console.log(
  "Deduped ./vault and ./catalog imports (kept the first occurrence).",
);
