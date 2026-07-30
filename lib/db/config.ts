const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

interface DatabaseEnvironment {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  DATABASE_POOL_MAX?: string;
}

export function resolveDatabaseUrl(
  environment: DatabaseEnvironment = process.env,
): string {
  const value =
    environment.DATABASE_URL?.trim() || environment.POSTGRES_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is required (POSTGRES_URL is accepted as a legacy fallback).",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://.");
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    throw new Error("DATABASE_URL must include a host and database name.");
  }

  return value;
}

export function resolveDatabasePoolMax(
  environment: DatabaseEnvironment = process.env,
): number {
  const raw = environment.DATABASE_POOL_MAX?.trim();
  if (!raw) return 1;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 10.");
  }
  return value;
}
