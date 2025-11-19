import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "**/*.test.ts", // Existing default pattern
      "**/*.spec.ts", // Existing default pattern
      "**/*.integration.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src-core"),
    },
  },
});
