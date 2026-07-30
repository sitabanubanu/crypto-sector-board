import "./envConfig";
import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();

const baseConfig = {
  dialect: "postgresql" as const,
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
};

export default defineConfig(
  databaseUrl
    ? {
        ...baseConfig,
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : baseConfig,
);
