import { runMigrations } from "@agent-native/core/db";

import { MIGRATIONS } from "../db/migrations.js";

export default runMigrations(MIGRATIONS, { table: "dike_desk_migrations" });
