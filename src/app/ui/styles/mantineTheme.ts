import {
    colorsTuple,
    createTheme,
    type DefaultMantineColor,
    type MantineColorsTuple,
    Tooltip,
} from "@mantine/core";

type ExtendedCustomColors =
    | "primary"
    | "success"
    | "warning"
    | "error"
    | "gray"
    | "textLight"
    | "textDark"
    | "surfaceLight"
    | "surfaceDark"
    | "borderLight"
    | "borderDark"
    | DefaultMantineColor;

declare module "@mantine/core" {
    interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>;
    }
}

const primaryColors: MantineColorsTuple = [
    "#F4F8FB",
    "#cee6f7",
    "#a9d4f4",
    "#7dc0f2",
    "#50adf2",
    "#2099f3",
    "#0885e2",
    "#00528f",
    "#02375f",
    "#032b4a",
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
    "#f3f4fb",
    "#e5e6ea",
    "#c9cacf",
    "#abadb5",
    "#92949f",
    "#828492",
    "#7a7d8c",
    "#686a7a",
    "#575a69",
    "#4d5163",
];
const yellows: MantineColorsTuple = [
    "#fff5e0",
    "#ffeacb",
    "#fed39b",
    "#fcbb67",
    "#faa83d",
    "#f99a1e",
    "#f9930b",
    "#de7f00",
    "#c67000",
    "#ac6000",
];

const greens: MantineColorsTuple = [
    "#f4fbe9",
    "#e9f3da",
    "#d3e4b7",
    "#bbd590",
    "#a7c86f",
    "#9ac059",
    "#93bc4d",
    "#82a93f",
    "#709334",
    "#5e7f27",
];

export const theme = createTheme({
    colors: {
        primary: primaryColors,
        success: greens,
        warning: yellows,
        error: dangerColors,
        gray: grays,
        textLight: colorsTuple("#0f2f4c"),
        textDark: colorsTuple("#fff"),
        surfaceLight: colorsTuple("#fff"),
        surfaceDark: colorsTuple("#2a2d31"),
        borderLight: colorsTuple("#E6E6E6"),
        borderDark: colorsTuple("#2c3036"),
    },
    primaryColor: "primary",
    //   defaults
    primaryShade: {
        light: 8,
        dark: 5,
    },
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
    components: {
        Tooltip: Tooltip.extend({
            defaultProps: {
                openDelay: 200,
            },
        }),
    },
});
type ThemeType = typeof theme;

export const cssVariablesResolver = (theme: ThemeType) => {
    return {
        variables: {},
        light: {
            "--mantine-color-text": theme.colors?.textLight?.[0] || "",
            "--mantine-color-body": theme.colors?.surfaceLight?.[0] || "",
            "--mantine-color-default-border":
                theme.colors?.borderLight?.[0] || "",
        },
        dark: {
            "--mantine-color-text": theme.colors?.textDark?.[0] || "",
            "--mantine-color-body": theme.colors?.surfaceDark?.[0] || "",
            "--mantine-color-default-border":
                theme.colors?.borderDark?.[0] || "",
        },
    };
};
