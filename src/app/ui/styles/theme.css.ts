// theme.css.ts

import { themeToVars } from "@mantine/vanilla-extract";
import { mediaQuery } from "@/app/ui/styles/breakpoints.ts";
import { theme } from "@/app/ui/styles/mantineTheme.ts";

// CSS variables object, can be access in *.css.ts files
export const vars = themeToVars(theme);
export const virtualVars = {
    text: vars.colors.text,
    surface: vars.colors.body,
    border: vars.colors.defaultBorder,
};
export const darkSelector = "[data-mantine-color-scheme='dark']";
export const breakpoints = {
    minWSmall: mediaQuery.up("sm"),
    minWMd: mediaQuery.up("md"),
    minWLg: mediaQuery.up("lg"),
    minWXl: mediaQuery.up("xl"),
};
// export const
// export const virtualColors = {
//   textLight: theme.other?.textColor?.light,
//   textDark: theme.other?.textColor?.dark,
//   surfaceLight: theme.other?.surface?.light,
//   surfaceDark: theme.other?.surface?.dark,
//   borderLight: theme.other?.border?.light,
//   borderDark: theme.other?.border?.dark,
// }
