import { defineConfig } from 'vitest/config';
import path from "node:path";

export default defineConfig({
    test: {
        // This property defines which files Vitest should look for
        include: [
            '**/*.test.ts', // Existing default pattern
            '**/*.spec.ts', // Existing default pattern

            // ✨ ADD THIS LINE to include .integration.ts files
            '**/*.integration.ts'
        ],
        // ... other test options (globals, environment, etc.)
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@core": path.resolve(__dirname, "./src-core"),
        },
    },
});
