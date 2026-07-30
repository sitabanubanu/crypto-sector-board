import "../envConfig";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import { getDataHealthReport } from "../lib/ingestion/data-health";

async function main() {
  const report = await getDataHealthReport(getDatabase());
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "healthy") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(
      "Data health check failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
