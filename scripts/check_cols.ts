import { prisma } from '../lib/prisma';

async function main() {
  const cols = await prisma.$queryRaw`
    SELECT COLUMN_NAME AS column_name
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'WorkflowNode'
    ORDER BY ORDINAL_POSITION
  `;
  console.log(JSON.stringify(cols, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
