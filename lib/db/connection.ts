import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolveDatabasePoolMax, resolveDatabaseUrl } from "./config";
import * as schema from "./schema";

type SqlClient = ReturnType<typeof postgres>;
export type Database = PostgresJsDatabase<typeof schema>;

interface DatabaseState {
  client?: SqlClient;
  database?: Database;
}

const globalDatabaseState = globalThis as typeof globalThis & {
  __cryptoSectorDatabaseState?: DatabaseState;
};

function getState(): DatabaseState {
  globalDatabaseState.__cryptoSectorDatabaseState ??= {};
  return globalDatabaseState.__cryptoSectorDatabaseState;
}

export function getDatabase(): Database {
  const state = getState();
  if (state.database) return state.database;

  const client = postgres(resolveDatabaseUrl(), {
    max: resolveDatabasePoolMax(),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const database = drizzle(client, { schema });
  state.client = client;
  state.database = database;
  return database;
}

export async function closeDatabase(): Promise<void> {
  const state = getState();
  const client = state.client;
  state.client = undefined;
  state.database = undefined;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
