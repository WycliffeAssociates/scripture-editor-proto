import path from "node:path";
import { lingui } from "@lingui/vite-plugin";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [
        react({
            babel: {
                plugins: ["@lingui/babel-plugin-lingui-macro"],
            },
        }),
        lingui(),
        vanillaExtractPlugin(),
        wasm(),
    ],
    test: {
        include: [
            "**/*.test.ts", // Existing default pattern
            "**/*.spec.ts", // Existing default pattern
            "**/*.integration.ts",
            "**/*.test.tsx",
            "**/*.spec.tsx",
            "!src/test/e2e/**",
        ],
        setupFiles: ["./src/test/vitest.setup.ts"],
        server: {
            deps: {
                inline: ["usfm-onion-web"],
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@core": path.resolve(__dirname, "./src-core"),
        },
    },
});
