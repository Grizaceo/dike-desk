import type { DbExec, DbExecInput, MigrationEntry } from "@agent-native/core/db";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { MIGRATIONS } from "../../server/db/migrations.js";
import * as schema from "../../server/db/schema.js";

function statementText(statement: DbExecInput) {
  if (typeof statement === "string") return statement;
  if (
    statement &&
    typeof statement === "object" &&
    "sql" in statement &&
    typeof statement.sql === "string"
  )
    return statement.sql;
  throw new Error("Test migrations only execute SQL text.");
}

/** DbExec over one PGlite database. `transaction` is that database's transaction. */
export function pgliteExec(client: PGlite): DbExec {
  return {
    async execute(statement) {
      const result = await client.query(statementText(statement));
      return { rows: result.rows, rowsAffected: result.affectedRows ?? 0 };
    },
    transaction(fn) {
      return client.transaction(async (tx) => {
        const txExec: DbExec = {
          async execute(statement) {
            const result = await tx.query(statementText(statement));
            return {
              rows: result.rows,
              rowsAffected: result.affectedRows ?? 0,
            };
          },
        };
        return fn(txExec);
      });
    },
  };
}

export async function applyMigration(
  client: PGlite,
  migration: MigrationEntry,
) {
  if (migration.run) await migration.run(pgliteExec(client));
  const sql =
    typeof migration.sql === "string" ? migration.sql : migration.sql?.postgres;
  if (sql) await client.exec(sql);
}

/** In-memory Postgres with the app's real migration SQL applied. */
export async function createTestDb() {
  const client = new PGlite();
  for (const migration of MIGRATIONS) await applyMigration(client, migration);
  return drizzle(client, { schema });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
