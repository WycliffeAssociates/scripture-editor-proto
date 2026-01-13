import path from "node:path";
import { lingui } from "@lingui/vite-plugin";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
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
    ],
    test: {
        include: [
            "**/*.test.ts", // Existing default pattern
            "**/*.spec.ts", // Existing default pattern
            "**/*.integration.ts",
            "!src/test/e2e/**",
        ],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@core": path.resolve(__dirname, "./src-core"),
        },
    },
});
