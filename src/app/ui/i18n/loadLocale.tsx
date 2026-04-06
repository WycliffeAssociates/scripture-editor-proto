import { i18n } from "@lingui/core";

export const APP_LOCALE_CHANGE_EVENT = "app:locale-change";

/**
 * Load and activate one locale bundle on demand.
 *
 * Settings changes and first-boot locale detection both flow through this helper
 * so there is one place responsible for loading Lingui message catalogs.
 */
export async function loadLocale(locale: string) {
    const { messages } = await import(`./locales/${locale}/messages.ts`);
    i18n.load(locale, messages);
    i18n.activate(locale);

    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent(APP_LOCALE_CHANGE_EVENT, {
                detail: { locale },
            }),
        );
    }
}
