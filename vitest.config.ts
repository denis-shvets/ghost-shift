import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests run in Node, without the Workers runtime.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // All test files share one local database, so they run one at a time.
    fileParallelism: false,
  },
});
