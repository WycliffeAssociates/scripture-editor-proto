import {
  em,
  type MantineTheme,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery as useMantineMediaQuery } from "@mantine/hooks";
import { createContext, useContext, useEffect, useState } from "react";

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

// Default breakpoints (in px)
const BREAKPOINTS = {
  xs: em(0),
  sm: em(576),
  md: em(768),
  lg: em(992),
  xl: em(1200),
};

export const ThemeQueryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg"); // Default to lg
  const [mobileTab, setMobileTab] = useState<"main" | "ref">("main");

  // Use Mantine's useMediaQuery to detect screen size changes
  const isXs = useMantineMediaQuery(`(max-width: ${BREAKPOINTS.sm})`);
  const isSm = useMantineMediaQuery(
    `(min-width: ${BREAKPOINTS.xs}) and (max-width: ${BREAKPOINTS.md})`,
  );
  const isMd = useMantineMediaQuery(
    `(min-width: ${BREAKPOINTS.md}) and (max-width: ${BREAKPOINTS.lg})`,
  );
  const isLg = useMantineMediaQuery(`(min-width: ${BREAKPOINTS.lg})`);
  const isXl = useMantineMediaQuery(`(min-width: ${BREAKPOINTS.xl})`);
  const isTouch = useMantineMediaQuery("(hover: none)");
  const { colorScheme } = useMantineColorScheme();
  const theme = useMantineTheme();
  const isDarkTheme = colorScheme === "dark";

  // Update breakpoint based on media queries
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

export const useWorkspaceMediaQuery = (): MediaQueryContextType => {
  const context = useContext(MediaQueryContext);
  if (context === undefined) {
    throw new Error(
      "useWorkspaceMediaQuery must be used within a MediaQueryProvider",
    );
  }
  return context;
};

// Type guard for breakpoint
export const isBreakpoint = (
  bp: Breakpoint,
  context: MediaQueryContextType,
): boolean => {
  switch (bp) {
    case "xs":
      return context.isXs;
    case "sm":
      return context.isSm;
    case "md":
      return context.isMd;
    case "lg":
      return context.isLg;
    case "xl":
      return context.isXl;
    default:
      return false;
  }
};
