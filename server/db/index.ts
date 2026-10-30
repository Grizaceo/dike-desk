import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "brief",
  resourceTable: schema.briefs,
  sharesTable: schema.briefShares,
  displayName: "Brief",
  titleColumn: "title",
  getResourcePath: (brief) => `/briefs/${brief.id}`,
  getDb,
});
