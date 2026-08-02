import {
  rule_catalog,
  type RuleId,
  type SousConfig,
} from "scripture-sous-chef-web";

import type { Settings } from "@/app/data/settings.ts";

export function galleyConfigFromSettings(settings: Settings): SousConfig {
  const proofreading = settings.proofreading;
  // The demo settings surface presents every catalog card as enabled when its
  // value is absent. Galley treats an absent rule as “use the engine default,”
  // which intentionally leaves some review rules off (including duplicate
  // words). Materialize the UI's all-on default here, then let an explicit
  // persisted false continue to disable a rule.
  const allRules = Object.fromEntries(
    rule_catalog().cards.map((card) => [card.code, true]),
  ) as Partial<Record<RuleId, boolean>>;
  return {
    rules: { ...allRules, ...proofreading.rules },
    review: { depth: proofreading.depth },
  };
}
