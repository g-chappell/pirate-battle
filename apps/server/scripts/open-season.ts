import { getPrisma } from "@pirate-battle/db";

import { PrismaSeasonStore } from "../src/seasonStore.js";

function monthBoundsUtc(at: Date): { name: string; startsAt: Date; endsAt: Date } {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const startsAt = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const endsAt = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const name = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}`;
  return { name, startsAt, endsAt };
}

async function main() {
  const prisma = getPrisma();
  const store = new PrismaSeasonStore(prisma);
  const now = new Date();
  const { name, startsAt, endsAt } = monthBoundsUtc(now);

  const existing = await prisma.season.findUnique({ where: { name } });
  if (existing) {
    process.stdout.write(
      `season ${name} already exists (id=${existing.id}, ends ${existing.endsAt.toISOString()})\n`,
    );
    return;
  }

  const season = await store.open({
    name,
    startsAt: startsAt.getTime(),
    endsAt: endsAt.getTime(),
  });
  process.stdout.write(
    `opened season ${season.name} (id=${season.id}) [${new Date(season.startsAt).toISOString()} .. ${new Date(season.endsAt).toISOString()})\n`,
  );
}

main()
  .catch((err) => {
    process.stderr.write(`open-season failed: ${(err as Error).message}\n`);
    process.exit(1);
  })
  .finally(() => {
    void getPrisma().$disconnect();
  });
