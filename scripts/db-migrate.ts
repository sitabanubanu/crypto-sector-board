import "../envConfig";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, getDatabase } from "../lib/db/connection";

async function main() {
  const database = getDatabase();
  await migrate(database, {
    migrationsFolder: "drizzle",
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations",
  });
  console.log("Database migrations applied.");
}

main()
  .catch((error) => {
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
