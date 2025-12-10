import fs from "node:fs/promises";
import path from "node:path";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    build: {
        outDir: "./dist-web",
    },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/app/routes",
            generatedRouteTree: "./src/app/generated/routeTree.gen.ts",
        }),
        react({
            babel: {
                plugins: ["@lingui/babel-plugin-lingui-macro"],
            },
        }),
        lingui(),
        tailwindcss(),
        vanillaExtractPlugin(),
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
});
