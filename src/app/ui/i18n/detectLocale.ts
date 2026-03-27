import { SUPPORTED_LOCALES } from "@/app/data/settings.ts";

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
            if (SUPPORTED_LOCALES.includes(locale)) {
                return locale;
            }

            const languageCode = locale.split("-")[0];
            if (SUPPORTED_LOCALES.includes(languageCode)) {
                return languageCode;
            }
        }
    }

    if (navigator.language) {
        if (SUPPORTED_LOCALES.includes(navigator.language)) {
            return navigator.language;
        }

        const languageCode = navigator.language.split("-")[0];
        if (SUPPORTED_LOCALES.includes(languageCode)) {
            return languageCode;
        }
    }

    return "en";
}
