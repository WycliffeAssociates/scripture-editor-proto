// import "./App.css";
// import "./ui/styles/";
import "@mantine/core/styles.css";
import "@/app/ui/styles/global.css";
import "@/app/ui/styles/usfm.css";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { SettingsManager } from "@/app/data/settings.ts";
import { routeTree } from "@/app/generated/routeTree.gen.ts";
import { I18nEntry } from "@/app/ui/i18n/i18nEntry.tsx";
import { cssVariablesResolver, theme } from "@/app/ui/styles/mantineTheme.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { IGitProvider } from "@/core/persistence/git/GitProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";
import { ProjectRepository } from "@/core/persistence/repositories/ProjectRepository.ts";

type EntryPointProps = {
    settingsManager: SettingsManager;
    gitProvider: IGitProvider;
    directoryProvider: IDirectoryProvider;
    md5Service: IMd5Service;
};

// Create a client for React Query
const queryClient = new QueryClient();

export interface RouterContext {
    queryClient: QueryClient; //for if wanting to manage tanstack query in route loader,
    settingsManager: SettingsManager;
    gitProvider: IGitProvider;
    directoryProvider: IDirectoryProvider;
    projectRepository: IProjectRepository;
}

// wrapping this let's us get it's type as ReturnType to declaration merge, whilse just receiving service deps as props to app
const wrapCreateRouter = (
    settingsManager: SettingsManager,
    gitProvider: IGitProvider,
    directoryProvider: IDirectoryProvider,
    projectRepository: IProjectRepository,
) => {
    const router = createRouter({
        routeTree,
        context: {
            settingsManager,
            queryClient,
            gitProvider,
            directoryProvider,
            projectRepository,
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
    gitProvider,
    directoryProvider,
    md5Service,
}: EntryPointProps) {
    const projectRepository = new ProjectRepository(
        directoryProvider,
        md5Service,
    );

    // Create a router
    const router = wrapCreateRouter(
        settingsManager,
        gitProvider,
        directoryProvider,
        projectRepository,
    );

    return (
        <I18nEntry defaultLocale={settingsManager.get("appLanguage")}>
            <QueryClientProvider client={queryClient}>
                <MantineProvider
                    theme={theme}
                    cssVariablesResolver={cssVariablesResolver}
                    defaultColorScheme={
                        settingsManager.get("colorScheme") || "light"
                    }
                >
                    <RouterProvider router={router} />
                </MantineProvider>
            </QueryClientProvider>
        </I18nEntry>
    );
}
