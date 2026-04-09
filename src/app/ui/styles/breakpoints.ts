export type BreakpointName = "xs" | "sm" | "md" | "lg" | "xl";

function pxToEm(px: number) {
    return `${px / 16}em`;
}

const breakpointValuesPx: Record<BreakpointName, number> = {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
};

export const mediaQuery = {
    up(name: BreakpointName) {
        return `screen and (min-width: ${runtimeBreakpointValuesEm[name]})`;
    },
    down(name: Exclude<BreakpointName, "xs">) {
        return `screen and (max-width: ${runtimeBreakpointValuesEm[name]})`;
    },
    between(min: BreakpointName, max: Exclude<BreakpointName, "xs">) {
        return `screen and (min-width: ${runtimeBreakpointValuesEm[min]}) and (max-width: ${runtimeBreakpointValuesEm[max]})`;
    },
};

const runtimeBreakpointValuesEm: Record<BreakpointName, string> = {
    xs: pxToEm(breakpointValuesPx.xs),
    sm: pxToEm(breakpointValuesPx.sm),
    md: pxToEm(breakpointValuesPx.md),
    lg: pxToEm(breakpointValuesPx.lg),
    xl: pxToEm(breakpointValuesPx.xl),
};

export const runtimeMediaQuery = {
    up(name: BreakpointName) {
        return `(min-width: ${runtimeBreakpointValuesEm[name]})`;
    },
    down(name: Exclude<BreakpointName, "xs">) {
        return `(max-width: ${runtimeBreakpointValuesEm[name]})`;
    },
    between(min: BreakpointName, max: Exclude<BreakpointName, "xs">) {
        return `(min-width: ${runtimeBreakpointValuesEm[min]}) and (max-width: ${runtimeBreakpointValuesEm[max]})`;
    },
};
