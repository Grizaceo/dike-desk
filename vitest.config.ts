import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/.react-router/**",
    ],
    // Each DB test builds a fresh in-memory PGlite and applies migrations in
    // beforeEach. Vitest otherwise uses one worker per CPU minus one, so an
    // 8-core box runs seven of those forks together. With only a couple of GB
    // free, that contention exceeds the 10s hook timeout. Two workers keep
    // file parallelism without stacking every migration at once. The longer
    // timeouts cover a busy machine; a stuck hook or test still fails.
    maxWorkers: 2,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // tests/ is outside tsconfig.json "include" on purpose. Adding it reports
    // ~118 errors (mostly TS18048/TS2532, plus a .catch on a non-promise union
    // at tests/brief-access.test.ts:347). Left for a later change.
  },
});
