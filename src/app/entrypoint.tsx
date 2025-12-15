// import "./App.css";
// import "./ui/styles/";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/app/ui/styles/global.css";
import "@/app/ui/styles/usfm.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { PlatformAndWeb } from "@/app/data/constants.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import { routeTree } from "@/app/generated/routeTree.gen.ts";
import { ThemeQueryProvider } from "@/app/ui/contexts/MediaQuery.tsx";
import { I18nEntry } from "@/app/ui/i18n/i18nEntry.tsx";
import { cssVariablesResolver, theme } from "@/app/ui/styles/mantineTheme.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";
import { ProjectRepository } from "@/core/persistence/repositories/ProjectRepository.ts";

type EntryPointProps = {
    settingsManager: SettingsManager;
    directoryProvider: IDirectoryProvider;
    md5Service: IMd5Service;
    opener: IOpener;
    platform: PlatformAndWeb;
};

// Create a client for React Query
const queryClient = new QueryClient();

export interface RouterContext {
    queryClient: QueryClient; //for if wanting to manage tanstack query in route loader,
    settingsManager: SettingsManager;
    directoryProvider: IDirectoryProvider;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    opener: IOpener;
    platform: PlatformAndWeb;
}

// wrapping this let's us get it's type as ReturnType to declaration merge, whilse just receiving service deps as props to app
const wrapCreateRouter = (
    settingsManager: SettingsManager,
    directoryProvider: IDirectoryProvider,
    projectRepository: IProjectRepository,
    md5Service: IMd5Service,
    opener: IOpener,
    platform: PlatformAndWeb,
) => {
    const router = createRouter({
        routeTree,
        context: {
            settingsManager,
            queryClient,
            directoryProvider,
            projectRepository,
            md5Service,
            opener,
            platform,
        },
    });
    return router;
};
declare module "@tanstack/react-router" {
    interface Register {
        // This infers the type of our router and registers it across your entire project
        router: ReturnType<typeof wrapCreateRouter>;
    }
}

export function App({
    settingsManager,
    directoryProvider,
    md5Service,
    opener,
    platform,
}: EntryPointProps) {
    const projectRepository = new ProjectRepository(
        directoryProvider,
        md5Service,
    );

    // Create a router
    const router = wrapCreateRouter(
        settingsManager,
        directoryProvider,
        projectRepository,
        md5Service,
        opener,
        platform,
    );

    return (
        <I18nEntry>
            <QueryClientProvider client={queryClient}>
                <MantineProvider
                    theme={theme}
                    cssVariablesResolver={cssVariablesResolver}
                    defaultColorScheme={
                        settingsManager.get("colorScheme") || "light"
                    }
                >
                    <ThemeQueryProvider>
                        <Notifications />
                        <RouterProvider router={router} />
                    </ThemeQueryProvider>
                </MantineProvider>
            </QueryClientProvider>
        </I18nEntry>
    );
}
