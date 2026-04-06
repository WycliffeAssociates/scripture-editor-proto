import {
    darkThemeClass,
    lightThemeClass,
} from "@/app/ui/styles/designSystem.css.ts";

export type AppColorScheme = "light" | "dark";

const colorSchemeClasses = [lightThemeClass, darkThemeClass, "light", "dark"];

export function applyColorSchemeToDocument(
    colorScheme: AppColorScheme,
    root: HTMLElement = document.documentElement,
) {
    root.classList.remove(...colorSchemeClasses);
    root.classList.add(colorScheme);
    root.classList.add(
        colorScheme === "dark" ? darkThemeClass : lightThemeClass,
    );
    root.dataset.theme = colorScheme;
    root.style.colorScheme = colorScheme;
}
