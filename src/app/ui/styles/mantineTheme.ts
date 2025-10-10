import {createTheme, MantineColorsTuple, virtualColor} from "@mantine/core";

const primaryColors: MantineColorsTuple = [
  "#e7f3ff",
  "#d0e3ff",
  "#9ec5fc",
  "#69a5fb",
  "#4089fa",
  "#2978fa",
  "#1d70fb",
  "#105fe1",
  "#0057d1",
  "#0048b2",
];
const dangerColors: MantineColorsTuple = [
  "#ffedeb",
  "#f9d9d7",
  "#ecb2ae",
  "#e18882",
  "#d7645d",
  "#d24e45",
  "#d04138",
  "#c3362d",
  "#a52b24",
  "#91211d",
];
const grays: MantineColorsTuple = [
  "#ebf6ff",
  "#e0e8ef",
  "#c5ced6",
  "#9facb7",
  "#8d9ba7",
  "#7c8d9b",
  "#738696",
  "#607383",
  "#536676",
  "#42596b",
];

export const theme = createTheme({
  colors: {
    primary: primaryColors,
    red: dangerColors,
    gray: grays,
  },
  primaryColor: "primary",
  primaryShade: 8,
  black: "#0E0E0E",
  fontFamily: "Inter, system-ui, sans-serif",
  radius: {
    md: "8px",
    lg: "12px",
  },
  cursorType: "pointer",

  shadows: {
    md: "box-shadow: 0px 1px 2px 0px #1F1F1F3D, 0px 1px 3px 0px #1F1F1F1F",
  },
  other: {
    textColor: virtualColor({
      name: "textColor",
      light: "#0f2f4c",
      dark: "#fff",
    }),
    surface: virtualColor({
      name: "surface",
      light: "#fff",
      dark: "#18191c",
    }),
    border: virtualColor({
      name: "border",
      light: "#E6E6E6",
      dark: "#2c3036",
    }),
  },

  // variantColorResolver:
});
type ThemeType = typeof theme;

export const cssVariablesResolver = (theme: ThemeType) => {
  return {
    variables: {},
    light: {
      "--mantine-color-text": theme.other?.textColor?.light,
      "--mantine-color-body": theme.other?.surface?.light,
      "--mantine-color-default-border": theme.other?.border?.light,
    },
    dark: {
      "--mantine-color-text": theme.other?.textColor?.dark,
      "--mantine-color-body": theme.other?.surface?.dark,
      "--mantine-color-default-border": theme.other?.border?.dark,
    },
    // darkVariables: {
    //   '--mantine-primary-color': theme.colors?.cyan?.[8],
    // },
  };
};
