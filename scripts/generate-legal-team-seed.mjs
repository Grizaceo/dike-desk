import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../resources/es/", import.meta.url));
const output = new URL(
  "../server/lib/legal-team-seed.generated.ts",
  import.meta.url,
);

async function collect(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await collect(full, relative));
    else if (entry.isFile() && relative !== "LEARNINGS.md")
      result[relative] = await readFile(full, "utf8");
  }
  return result;
}

const seed = await collect(root);
await writeFile(
  output,
  `export const legalTeamSeed: Record<string, string> = ${JSON.stringify(seed, null, 2)};\n`,
);
