import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect } from "react";
import { detectLocale } from "@/app/ui/i18n/detectLocale.ts";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";

export function I18nEntry({
    children,
    defaultLocale,
}: {
    children: React.ReactNode;
    defaultLocale?: string;
}) {
    useEffect(() => {
        const locale = defaultLocale || detectLocale();
        loadLocale(locale);
    }, [defaultLocale]);

    return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
