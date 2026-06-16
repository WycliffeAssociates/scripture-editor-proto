import fs from "node:fs/promises";
import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

// https://vite.dev/config/
export default defineConfig({
  // Module workers get their own bundling pipeline; plugins from the main
  // `plugins` array do NOT apply. The workspace-mirror/backup workers import
  // the wasm-pack bundler-target packages, so the wasm plugin must be
  // declared here too (and wasm requires ESM-format worker output).
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  build: {
    outDir: "./dist-web",
  },
  plugins: [
    vanillaExtractPlugin(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/app/routes",
      generatedRouteTree: "./src/app/generated/routeTree.gen.ts",
    }),
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    lingui(),

    wasm(),
    {
      name: "my-plugin-for-index-html-build-replacement",

      transformIndexHtml: {
        order: "pre",
        handler: async () => {
          return await fs.readFile("./web.html", "utf8");
        },
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // chokidar's fsevents watcher drops consecutive writes to the same file
    // here, so .css.ts edits only hot-update the first time. Polling catches
    // every write. Scope it tightly — the CodeGraph SQLite db and build/Rust
    // output churn constantly and would waste polling cycles (and the db churn
    // can itself disrupt the watcher). Dev-server only; ignored by `vite build`.
    watch: {
      usePolling: true,
      interval: 100,
      ignored: [
        "**/.codegraph/**",
        "**/dist-web/**",
        "**/src/tauri/rust/target/**",
        "**/.git/**",
      ],
    },
  },
});
