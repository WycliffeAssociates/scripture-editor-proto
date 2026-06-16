import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect, useState } from "react";

import { detectLocale } from "@/app/ui/i18n/detectLocale.ts";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";

/**
 * React-side i18n bootstrap wrapper.
 *
 * The app entrypoint mounts this once near the top of the tree so Lingui is
 * activated before downstream components start rendering localized strings.
 */
export function I18nEntry({
  children,
  defaultLocale,
}: {
  children: React.ReactNode;
  defaultLocale?: string;
}) {
  const [isReady, setIsReady] = useState(Boolean(i18n.locale));

  useEffect(() => {
    const locale = defaultLocale || detectLocale();
    let isCancelled = false;

    void loadLocale(locale).then(() => {
      if (!isCancelled) {
        setIsReady(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [defaultLocale]);

  if (!isReady) {
    return null;
  }

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
