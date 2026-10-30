import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { MIGRATIONS } from "../../server/db/migrations.js";
import * as schema from "../../server/db/schema.js";

/** In-memory Postgres with the app's real migration SQL applied. */
export async function createTestDb() {
  const client = new PGlite();
  for (const migration of MIGRATIONS) {
    if (typeof migration.sql === "string") await client.exec(migration.sql);
  }
  return drizzle(client, { schema });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
