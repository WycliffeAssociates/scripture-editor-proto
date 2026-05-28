import { SUPPORTED_LOCALES } from "@/app/data/settings.ts";

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

/**
 * Pick the best supported locale from the browser environment.
 *
 * This runs during i18n bootstrap before the rest of the app is hydrated, so it
 * stays intentionally small and dependency-free.
 */
export function detectLocale(): string {
    if (typeof navigator === "undefined") {
        return "en";
    }

    if (navigator.languages && navigator.languages.length > 0) {
        for (const locale of navigator.languages) {
            if (SUPPORTED_LOCALE_SET.has(locale)) {
                return locale;
            }

            const languageCode = locale.split("-")[0];
            if (SUPPORTED_LOCALE_SET.has(languageCode)) {
                return languageCode;
            }
        }
    }

    if (navigator.language) {
        if (SUPPORTED_LOCALE_SET.has(navigator.language)) {
            return navigator.language;
        }

        const languageCode = navigator.language.split("-")[0];
        if (SUPPORTED_LOCALE_SET.has(languageCode)) {
            return languageCode;
        }
    }

    return "en";
}
