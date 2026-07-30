import "server-only";

import type { DataBackend } from "@/lib/market-data/bff-contracts";

interface DataBackendEnvironment {
  [key: string]: string | undefined;
  DATA_BACKEND?: string;
  DATA_DUAL_READ?: string;
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("DATA_DUAL_READ must be true or false.");
}

export function resolveDataBackend(
  environment: DataBackendEnvironment = process.env,
): DataBackend {
  const configured = environment.DATA_BACKEND?.trim();
  if (configured === "db") return "database";
  if (configured === "json") return "json";
  if (configured) {
    throw new Error("DATA_BACKEND must be db or json.");
  }

  return environment.DATABASE_URL?.trim() || environment.POSTGRES_URL?.trim()
    ? "database"
    : "json";
}

export function resolveDualRead(
  backend: DataBackend,
  environment: DataBackendEnvironment = process.env,
): boolean {
  if (backend === "json") return false;
  return parseBoolean(environment.DATA_DUAL_READ, true);
}
