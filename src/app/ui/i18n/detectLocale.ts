import { SUPPORTED_LOCALES } from "@/app/data/settings.ts";

export function detectLocale(): string {
    if (typeof navigator === "undefined") {
        return "en";
    }

    // Try navigator.languages first (array of preferred locales in order)
    if (navigator.languages && navigator.languages.length > 0) {
        for (const locale of navigator.languages) {
            // Try full locale first (e.g., "en-US", "es-ES")
            if (SUPPORTED_LOCALES.includes(locale)) {
                return locale;
            }

            // Try language code only (e.g., "en", "es")
            const languageCode = locale.split("-")[0];
            if (SUPPORTED_LOCALES.includes(languageCode)) {
                return languageCode;
            }
        }
    }

    // Fallback to navigator.language if navigator.languages not available
    if (navigator.language) {
        // Try full locale first
        if (SUPPORTED_LOCALES.includes(navigator.language)) {
            return navigator.language;
        }

        // Try language code only
        const languageCode = navigator.language.split("-")[0];
        if (SUPPORTED_LOCALES.includes(languageCode)) {
            return languageCode;
        }
    }

    // Fallback to English if no supported locale detected
    return "en";
}
