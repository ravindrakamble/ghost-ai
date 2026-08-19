// Starter seed script — replace with your own once the real schema
// (see context/feature-specs/05-prisma.md) is in place.
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.post.deleteMany();
  await prisma.author.deleteMany();

  const author = await prisma.author.create({
    data: {
      name: "Ada Lovelace",
      posts: {
        create: [
          { title: "Hello, Prisma Postgres" },
          { title: "Second starter post" },
          { title: "Third starter post" },
        ],
      },
    },
    include: { posts: true },
  });

  console.log(`Seeded author "${author.name}" with ${author.posts.length} post(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
