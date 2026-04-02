import {
    type MantineTheme,
    useMantineColorScheme,
    useMantineTheme,
} from "@mantine/core";
import { useMediaQuery as useMantineMediaQuery } from "@mantine/hooks";
import { createContext, useContext, useEffect, useState } from "react";
import { runtimeMediaQuery } from "@/app/ui/styles/breakpoints.ts";

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

interface MediaQueryContextType {
    breakpoint: Breakpoint;
    isXs: boolean;
    isSm: boolean;
    isMd: boolean;
    isLg: boolean;
    isXl: boolean;
    isTouch: boolean;
    isDarkTheme: boolean;
    theme: MantineTheme;
    mobileTab: "main" | "ref";
    setMobileTab: (tab: "main" | "ref") => void;
}

const MediaQueryContext = createContext<MediaQueryContextType | undefined>(
    undefined,
);

/**
 * UI-only responsive context.
 *
 * This context does not participate in the import/load/item architecture. Its
 * role is to keep layout decisions, theme flags, and small-screen reference-tab
 * state in one place so route and component code can stay focused on workspace
 * behavior.
 */
export const ThemeQueryProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg");
    const [mobileTab, setMobileTab] = useState<"main" | "ref">("main");

    const isXs = useMantineMediaQuery(runtimeMediaQuery.down("sm"));
    const isSm = useMantineMediaQuery(runtimeMediaQuery.between("xs", "md"));
    const isMd = useMantineMediaQuery(runtimeMediaQuery.between("md", "lg"));
    const isLg = useMantineMediaQuery(runtimeMediaQuery.up("lg"));
    const isXl = useMantineMediaQuery(runtimeMediaQuery.up("xl"));
    const isTouch = useMantineMediaQuery("(hover: none)");
    const { colorScheme } = useMantineColorScheme();
    const theme = useMantineTheme();
    const isDarkTheme = colorScheme === "dark";

    useEffect(() => {
        if (isXs) setBreakpoint("xs");
        else if (isSm) setBreakpoint("sm");
        else if (isMd) setBreakpoint("md");
        else if (isLg) setBreakpoint("lg");
        else if (isXl) setBreakpoint("xl");
    }, [isXs, isSm, isMd, isLg, isXl]);

    const value = {
        breakpoint,
        isXs,
        isSm,
        isMd,
        isLg,
        isXl,
        isTouch,
        isDarkTheme,
        theme,
        mobileTab,
        setMobileTab,
    };

    return (
        <MediaQueryContext.Provider value={value}>
            {children}
        </MediaQueryContext.Provider>
    );
};

/**
 * Read the current responsive UI context for workspace screens.
 */
export const useWorkspaceMediaQuery = (): MediaQueryContextType => {
    const context = useContext(MediaQueryContext);
    if (context === undefined) {
        throw new Error(
            "useWorkspaceMediaQuery must be used within a MediaQueryProvider",
        );
    }
    return context;
};
