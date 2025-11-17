import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as enMessages } from "./locales/en/messages.ts";
import { messages as esMessages } from "./locales/es/messages.ts";

export function I18nEntry({
    children,
    defaultLocale,
}: {
    children: React.ReactNode;
    defaultLocale: string;
}) {
    i18n.load({
        en: enMessages,
        es: esMessages,
    });
    i18n.activate(defaultLocale);

    return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
