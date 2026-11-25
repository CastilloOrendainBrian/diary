import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: no database required. Integration tests use vitest.integration.config.ts.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
  },
});
