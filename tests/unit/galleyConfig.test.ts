import { rule_catalog } from "scripture-sous-chef-web";
import { describe, expect, it } from "vitest";

import { settingsDefaults } from "@/app/data/settings.ts";
import { galleyConfigFromSettings } from "@/app/domain/sous/galleyConfig.ts";

describe("galleyConfigFromSettings", () => {
  it("materializes the demo all-on default for every catalog rule", () => {
    const config = galleyConfigFromSettings(settingsDefaults);

    for (const card of rule_catalog().cards) {
      expect(config.rules?.[card.code]).toBe(true);
    }
  });

  it("preserves explicit rule disables", () => {
    const config = galleyConfigFromSettings({
      ...settingsDefaults,
      proofreading: {
        ...settingsDefaults.proofreading,
        rules: { "lex.duplicate-word": false },
      },
    });

    expect(config.rules?.["lex.duplicate-word"]).toBe(false);
  });
});
