import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DEMO_PASSWORD = "demo1234";
const SUPERADMINS = [
  { email: "admin@jdphoebe.local", name: "Group Super Admin" },
  { email: "admin2@jdphoebe.local", name: "Group Super Admin 2" },
  { email: "admin3@jdphoebe.local", name: "Group Super Admin 3" },
];
const LEGACY_DEMO_SUPERADMIN_EMAILS = ["admin4@jdphoebe.local"];

function parseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const index = trimmed.indexOf("=");
  if (index === -1) return null;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFile(file: string, override = false) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (override || process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function loadEnv() {
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(root, ".env.local"), true);

  const overrideName = process.env.PRISMA_ENV_FILE?.trim();
  if (overrideName) {
    const overridePath = path.isAbsolute(overrideName) ? overrideName : path.join(root, overrideName);
    loadEnvFile(overridePath, true);
  }
}

async function main() {
  loadEnv();

  const prisma = new PrismaClient();
  const passwordHash = await hash(DEMO_PASSWORD, 10);
  const now = new Date();

  try {
    for (const account of SUPERADMINS) {
      const user = await prisma.user.upsert({
        where: { email: account.email },
        update: {
          name: account.name,
          title: "Group Office",
          isSuperAdmin: true,
          active: true,
          deletedAt: null,
          mustChangePassword: false,
          companionIntroCompletedAt: now,
        },
        create: {
          email: account.email,
          passwordHash,
          name: account.name,
          title: "Group Office",
          isSuperAdmin: true,
          active: true,
          mustChangePassword: false,
          companionIntroCompletedAt: now,
        },
      });

      console.log(`upserted superadmin: ${user.email}`);
    }

    const retiredDemoEmails = LEGACY_DEMO_SUPERADMIN_EMAILS.filter(
      (email) => !SUPERADMINS.some((account) => account.email === email),
    );
    if (retiredDemoEmails.length) {
      const retired = await prisma.user.updateMany({
        where: { email: { in: retiredDemoEmails } },
        data: { isSuperAdmin: false },
      });
      if (retired.count > 0) {
        console.log(`retired demo superadmin access from ${retired.count} account(s): ${retiredDemoEmails.join(", ")}`);
      }
    }

    const total = await prisma.user.count({
      where: { isSuperAdmin: true, deletedAt: null },
    });
    console.log(`total active superadmins: ${total}`);
    console.log(`shared demo password for new accounts: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
