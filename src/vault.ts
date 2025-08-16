import fs from "fs/promises";
import path from "path";

interface SecretEntry {
  value: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const VAULT_PATH = path.join(DATA_DIR, "vault.json");

async function readVault(): Promise<Record<string, SecretEntry>> {
  try {
    const raw = await fs.readFile(VAULT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeVault(data: Record<string, SecretEntry>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${VAULT_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, VAULT_PATH);
}

export async function setSecret(
  name: string,
  value: string,
): Promise<void> {
  const vault = await readVault();
  vault[name] = { value, updatedAt: new Date().toISOString() };
  await writeVault(vault);
}

export async function deleteSecret(name: string): Promise<void> {
  const vault = await readVault();
  if (vault[name]) {
    delete vault[name];
    await writeVault(vault);
  }
}

export async function hasSecret(name: string): Promise<boolean> {
  const vault = await readVault();
  return Boolean(vault[name]);
}

const SECRET_RE = /^\{\{SECRET:([^}]+)\}}$/;

export async function resolveArgs(rawArgs: any[]): Promise<any[]> {
  const vault = await readVault();
  return rawArgs.map((arg) => {
    if (typeof arg === "string") {
      const match = arg.match(SECRET_RE);
      if (match) {
        const name = match[1];
        const entry = vault[name];
        if (!entry) {
          throw new Error(`Missing secret: ${name}`);
        }
        return entry.value;
      }
    }
    return arg;
  });
}

