import { runMigrations } from "@agent-native/core/db";

import { MIGRATIONS } from "../db/migrations.js";

const migrate = runMigrations(MIGRATIONS, { table: "dike_desk_migrations" });
let migrations: Promise<void> | undefined;

export function ensureAppMigrations() {
  return (migrations ??= Promise.resolve(migrate(undefined)));
}

export default ensureAppMigrations;
