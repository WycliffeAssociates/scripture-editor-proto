// import "./App.css";
// import "./ui/styles/";
import "@/app/ui/styles/reset.css.ts";
import "@/app/ui/styles/global.css";
import "@/app/ui/styles/modules/usfm.css.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import type { PlatformAndWeb } from "@/app/data/constants.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import { routeTree } from "@/app/generated/routeTree.gen.ts";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import { UpdateBanner } from "@/app/ui/components/blocks/UpdateBanner.tsx";
import { NotificationViewport } from "@/app/ui/components/primitives/Notifications.tsx";
import { ThemeQueryProvider } from "@/app/ui/contexts/MediaQuery.tsx";
import { I18nEntry } from "@/app/ui/i18n/i18nEntry.tsx";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IUpdaterService } from "@/core/domain/updater/IUpdaterService.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { ImportService } from "@/core/library/ImportService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

/**
 * Shared app bootstrap props.
 *
 * The platform entrypoints in `src/web` and `src/tauri` assemble concrete
 * adapters, then hand those shared seams to this component so the React app can
 * stay platform-neutral.
 */
type EntryPointProps = {
    settingsManager: SettingsManager;
    fileSystem: FileSystem;
    md5Service: IMd5Service;
    authSessionProvider: AuthSessionProvider;
    giteaHostBaseUrl: string | null;
    storageRoots: StorageRoots;
    projectsService: ProjectsService;
    libraryService: LibraryService;
    importService: ImportService;
    usfmOnionService: IUsfmOnionService;
    gitProvider: GitProvider;
    opener: IOpener;
    platform: PlatformAndWeb;
    /** Desktop wires `TauriUpdaterService`; web passes null (no auto-updates). */
    updaterService?: IUpdaterService | null;
};

const queryClient = new QueryClient();

export interface RouterContext {
    /**
     * Router-wide service bag exposed to route loaders, hooks, and components.
     *
     * This is the bridge between platform bootstrap and the rest of the app.
     * Downstream code should pull shared seams from here instead of importing
     * platform implementations directly.
     */
    queryClient: QueryClient;
    settingsManager: SettingsManager;
    fileSystem: FileSystem;
    md5Service: IMd5Service;
    authSessionProvider: AuthSessionProvider;
    giteaHostBaseUrl: string | null;
    storageRoots: StorageRoots;
    projectsService: ProjectsService;
    libraryService: LibraryService;
    importService: ImportService;
    usfmOnionService: IUsfmOnionService;
    gitProvider: GitProvider;
    opener: IOpener;
    platform: PlatformAndWeb;
    updaterService: IUpdaterService | null;
}

const wrapCreateRouter = (
    settingsManager: SettingsManager,
    fileSystem: FileSystem,
    md5Service: IMd5Service,
    authSessionProvider: AuthSessionProvider,
    giteaHostBaseUrl: string | null,
    storageRoots: StorageRoots,
    projectsService: ProjectsService,
    libraryService: LibraryService,
    importService: ImportService,
    usfmOnionService: IUsfmOnionService,
    gitProvider: GitProvider,
    opener: IOpener,
    platform: PlatformAndWeb,
    updaterService: IUpdaterService | null,
) => {
    const router = createRouter({
        routeTree,
        context: {
            settingsManager,
            queryClient,
            fileSystem,
            md5Service,
            authSessionProvider,
            giteaHostBaseUrl,
            storageRoots,
            projectsService,
            libraryService,
            importService,
            usfmOnionService,
            gitProvider,
            opener,
            platform,
            updaterService,
        },
    });
    return router;
};
declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof wrapCreateRouter>;
    }
}

/**
 * Shared React entrypoint.
 *
 * This component owns framework bootstrap and one-time startup reconciliation.
 * By the time the UI renders, platform-specific adapters have already been
 * chosen and injected; from here on the app should operate through shared
 * library, filesystem, import, and editor seams.
 */
export function App({
    settingsManager,
    fileSystem,
    md5Service,
    authSessionProvider,
    giteaHostBaseUrl,
    storageRoots,
    projectsService,
    libraryService,
    importService,
    usfmOnionService,
    gitProvider,
    opener,
    platform,
    updaterService = null,
}: EntryPointProps) {
    const router = wrapCreateRouter(
        settingsManager,
        fileSystem,
        md5Service,
        authSessionProvider,
        giteaHostBaseUrl,
        storageRoots,
        projectsService,
        libraryService,
        importService,
        usfmOnionService,
        gitProvider,
        opener,
        platform,
        updaterService,
    );

    useEffect(() => {
        void (async () => {
            try {
                // Reconcile the index against managed storage before the first
                // route render so library listings do not show stale Dexie rows.
                await projectsService.reconcileIndex();
                await router.invalidate();
            } catch (error) {
                console.error("Failed to reconcile indexed projects", error);
            }
        })();
    }, [projectsService, router]);

    return (
        <I18nEntry defaultLocale={settingsManager.get("appLanguage")}>
            <QueryClientProvider client={queryClient}>
                <ThemeQueryProvider>
                    <NotificationViewport />
                    <UpdateBanner updaterService={updaterService} />
                    <RouterProvider router={router} />
                </ThemeQueryProvider>
            </QueryClientProvider>
        </I18nEntry>
    );
}
