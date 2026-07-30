import "../envConfig";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import { seedReferenceData } from "../lib/db/seed";

async function main() {
  const summary = await seedReferenceData(getDatabase());
  console.log(
    `Reference data seeded: ${summary.assets} assets, ${summary.aliases} aliases, ` +
      `${summary.providerInstruments} provider mappings, ${summary.sectors} sectors, ` +
      `${summary.sectorMemberships} memberships.`,
  );
}

main()
  .catch((error) => {
    console.error("Reference data seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
