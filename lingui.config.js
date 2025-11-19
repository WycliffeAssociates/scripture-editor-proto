import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es"],
  catalogs: [
    {
      path: "<rootDir>/src/app/ui/i18n/locales/{locale}/messages",
      include: ["./src"],
      exclude: ["./src/tauri/**", "./src/test/**"],
    },
  ],
});
