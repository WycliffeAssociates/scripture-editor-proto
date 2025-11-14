import {
    Button,
    createTheme,
    type MantineColorsTuple,
    Tooltip,
    virtualColor,
} from "@mantine/core";

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
const reds: MantineColorsTuple = [
    "#ffedee",
    "#f5dcdd",
    "#e3b8ba",
    "#d19294",
    "#c27274",
    "#ba5d60",
    "#b85659",
    "#a14246",
    "#90393d",
    "#802e33",
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
        error: reds,
        gray: grays,
    },
    primaryColor: "primary",
    //   defaults
    primaryShade: {
        light: 8,
        dark: 4,
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
    other: {
        textColor: virtualColor({
            name: "textColor",
            light: "#0f2f4c",
            dark: "#fff",
        }),
        surface: virtualColor({
            name: "surface",
            light: "#fff",
            dark: "#2a2d31",
        }),
        border: virtualColor({
            name: "border",
            light: "#E6E6E6",
            dark: "#2c3036",
        }),
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
