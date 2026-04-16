import { prisma } from '../lib/prisma';

async function main() {
  const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'WorkflowNode' ORDER BY ordinal_position`;
  console.log(JSON.stringify(cols, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
