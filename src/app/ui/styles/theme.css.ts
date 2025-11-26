// theme.css.ts

import { themeToVars } from "@mantine/vanilla-extract";
import { theme } from "@/app/ui/styles/mantineTheme.ts";

// CSS variables object, can be access in *.css.ts files
export const vars = themeToVars(theme);
export const virtualVars = {
  text: "var(--mantine-color-text)",
  surface: "var(--mantine-color-body)",
  border: "var(--mantine-color-default-border)",
};
export const darkSelector = "[data-mantine-color-scheme='dark']";
// export const
// export const virtualColors = {
//   textLight: theme.other?.textColor?.light,
//   textDark: theme.other?.textColor?.dark,
//   surfaceLight: theme.other?.surface?.light,
//   surfaceDark: theme.other?.surface?.dark,
//   borderLight: theme.other?.border?.light,
//   borderDark: theme.other?.border?.dark,
// }
