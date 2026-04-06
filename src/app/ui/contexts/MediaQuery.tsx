import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { runtimeMediaQuery } from "@/app/ui/styles/breakpoints.ts";

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";
type MobileTab = "main" | "ref";
type AppColorScheme = "light" | "dark";

interface MediaQueryContextType {
    breakpoint: Breakpoint;
    isXs: boolean;
    isSm: boolean;
    isMd: boolean;
    isLg: boolean;
    isXl: boolean;
    isTouch: boolean;
    isDarkTheme: boolean;
    mobileTab: MobileTab;
    setMobileTab: (tab: MobileTab) => void;
}

const MediaQueryContext = createContext<MediaQueryContextType | undefined>(
    undefined,
);

export const ThemeQueryProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [mobileTab, setMobileTab] = useState<MobileTab>("main");
    const isXs = useMediaQuery(runtimeMediaQuery.down("sm"));
    const isSm = useMediaQuery(runtimeMediaQuery.between("xs", "md"));
    const isMd = useMediaQuery(runtimeMediaQuery.between("md", "lg"));
    const isLg = useMediaQuery(runtimeMediaQuery.up("lg"));
    const isXl = useMediaQuery(runtimeMediaQuery.up("xl"));
    const isTouch = useMediaQuery("(hover: none)");
    const colorScheme = useDocumentColorScheme();

    const breakpoint = useMemo<Breakpoint>(() => {
        if (isXs) return "xs";
        if (isSm) return "sm";
        if (isMd) return "md";
        if (isXl) return "xl";
        if (isLg) return "lg";
        return "lg";
    }, [isLg, isMd, isSm, isXl, isXs]);

    const value = {
        breakpoint,
        isXs,
        isSm,
        isMd,
        isLg,
        isXl,
        isTouch,
        isDarkTheme: colorScheme === "dark",
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

function useMediaQuery(query: string) {
    const getMatches = () => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return false;
        }
        return window.matchMedia(query).matches;
    };

    const [matches, setMatches] = useState(getMatches);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return;
        }

        const mediaQueryList = window.matchMedia(query);
        const handleChange = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        setMatches(mediaQueryList.matches);
        mediaQueryList.addEventListener("change", handleChange);

        return () => {
            mediaQueryList.removeEventListener("change", handleChange);
        };
    }, [query]);

    return matches;
}

function useDocumentColorScheme() {
    const [colorScheme, setColorScheme] = useState<AppColorScheme>(() =>
        getDocumentColorScheme(),
    );

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }

        const root = document.documentElement;
        const observer = new MutationObserver(() => {
            setColorScheme(getDocumentColorScheme());
        });

        observer.observe(root, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
        });

        return () => {
            observer.disconnect();
        };
    }, []);

    return colorScheme;
}

function getDocumentColorScheme(): AppColorScheme {
    if (typeof document === "undefined") {
        return "light";
    }

    const root = document.documentElement;
    const datasetTheme = root.dataset.theme;
    if (datasetTheme === "dark" || datasetTheme === "light") {
        return datasetTheme;
    }

    if (root.classList.contains("dark")) {
        return "dark";
    }

    return "light";
}
