#!/usr/bin/env node
/**
 * Loads `.env`, then optionally overrides from `PRISMA_ENV_FILE` (e.g. `.env.production.local`
 * after `vercel env pull .env.production.local --environment production`).
 * Keys in the override file replace existing values so you can seed the **production** DB
 * even when `.env` already has a local `DATABASE_URL`.
 *
 * Then sets DIRECT_URL from DATABASE_URL when DIRECT_URL is still unset.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

function parseLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const i = t.indexOf("=");
  if (i === -1) return null;
  const key = t.slice(0, i).trim();
  let val = t.slice(i + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const p = parseLine(line);
    if (!p) continue;
    if (process.env[p.key] === undefined) process.env[p.key] = p.val;
  }
}

/** Override process.env for every key present in the file (non-empty values only). */
function loadDotEnvOverride(file) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const p = parseLine(line);
    if (!p || p.val === "") continue;
    process.env[p.key] = p.val;
  }
}

loadDotEnv(envPath);

const overrideName = process.env.PRISMA_ENV_FILE?.trim();
if (overrideName) {
  const overridePath = path.isAbsolute(overrideName)
    ? overrideName
    : path.join(root, overrideName);
  if (existsSync(overridePath)) {
    console.error(`[prisma-env] Applying override: ${overridePath}`);
    loadDotEnvOverride(overridePath);
  } else {
    console.error(`[prisma-env] PRISMA_ENV_FILE not found: ${overridePath}`);
    process.exit(1);
  }
}

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const prismaArgs = process.argv.slice(2);
if (prismaArgs.length === 0) {
  console.error("Usage: node scripts/prisma-env.mjs <prisma subcommand> [args…]");
  console.error('Example: node scripts/prisma-env.mjs db push');
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", ...prismaArgs], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status === null ? 1 : r.status);
