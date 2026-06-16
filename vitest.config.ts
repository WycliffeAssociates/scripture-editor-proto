import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    lingui(),
    vanillaExtractPlugin(),
    wasm(),
  ],
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.spec.ts",
      "tests/unit/**/*.integration.ts",
      "tests/unit/**/*.test.tsx",
      "tests/unit/**/*.spec.tsx",
    ],
    setupFiles: ["./tests/helpers/vitest.setup.ts"],
    server: {
      deps: {
        inline: ["usfm-onion-web", "scripture-sous-chef-web"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
      "@core": path.resolve(__dirname, "./src-core"),
    },
  },
});
