import "../envConfig";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import { importLegacySnapshots } from "../lib/ingestion/legacy-import";

async function main() {
  const summary = await importLegacySnapshots(getDatabase());
  console.log(
    JSON.stringify(
      {
        importedFiles: summary.importedFiles,
        skippedFiles: summary.skippedFiles,
        failedFiles: summary.failedFiles,
        acceptedAssets: summary.acceptedAssets,
        rejectedAssets: summary.rejectedAssets,
        files: summary.files.map((file) => ({
          file: file.file,
          status: file.status,
          acceptedCount: file.acceptedCount,
          rejectedCount: file.rejectedCount,
          errorCount: file.errors.length,
        })),
      },
      null,
      2,
    ),
  );
  if (summary.failedFiles > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(
      "Legacy snapshot import failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
