// Run with: npx tsx scripts/verify-prisma.ts  (or: npm run prisma:verify)
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const authorCount = await prisma.author.count();
  console.log(`✅ Connected — found ${authorCount} author row(s).`);
}

main()
  .catch((error) => {
    console.error("❌ Prisma connection check failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
