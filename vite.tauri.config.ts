import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
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
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // chokidar's fsevents watcher drops consecutive writes to the same file
      // here, so .css.ts edits only hot-update the first time. Polling catches
      // every write; the ignores keep it cheap (Rust output + the CodeGraph
      // SQLite db churn constantly and would waste polling cycles).
      usePolling: true,
      interval: 100,
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src/tauri/rust/**", "**/.codegraph/**", "**/.git/**"],
    },
  },
});
