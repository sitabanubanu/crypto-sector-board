import { describe, expect, it } from "vitest";
import {
  resolveDatabasePoolMax,
  resolveDatabaseUrl,
} from "../lib/db/config";

describe("database configuration", () => {
  it("prefers DATABASE_URL and accepts the legacy fallback", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgresql://primary:secret@db.example/app",
        POSTGRES_URL: "postgresql://legacy:secret@db.example/app",
      }),
    ).toContain("primary");
    expect(
      resolveDatabaseUrl({
        POSTGRES_URL: "postgres://legacy:secret@db.example/app",
      }),
    ).toContain("legacy");
  });

  it("rejects missing, malformed and non-PostgreSQL URLs", () => {
    expect(() => resolveDatabaseUrl({})).toThrow("DATABASE_URL is required");
    expect(() => resolveDatabaseUrl({ DATABASE_URL: "not-a-url" })).toThrow(
      "valid PostgreSQL URL",
    );
    expect(() =>
      resolveDatabaseUrl({ DATABASE_URL: "https://db.example/app" }),
    ).toThrow("postgres:// or postgresql://");
    expect(() =>
      resolveDatabaseUrl({ DATABASE_URL: "postgresql://db.example" }),
    ).toThrow("host and database name");
  });

  it("keeps serverless pools small and validates overrides", () => {
    expect(resolveDatabasePoolMax({})).toBe(1);
    expect(resolveDatabasePoolMax({ DATABASE_POOL_MAX: "4" })).toBe(4);
    for (const invalid of ["0", "11", "1.5", "abc"]) {
      expect(() =>
        resolveDatabasePoolMax({ DATABASE_POOL_MAX: invalid }),
      ).toThrow("integer from 1 to 10");
    }
  });
});
