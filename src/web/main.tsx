import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import type { PlatformAndWeb } from "@/app/data/constants.ts";
import { App } from "@/app/entrypoint.tsx";
import { DefaultLibraryService } from "@/app/library/DefaultLibraryService.ts";
import {
    buildProjectIndexDbName,
    DexieProjectIndex,
} from "@/app/persistence/DexieProjectIndex.ts";
import { applyColorSchemeToDocument } from "@/app/ui/theme/appTheme.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { FsBackedAuthSessionProvider } from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import { GiteaRemoteRepoProvider } from "@/core/persistence/GiteaRemoteRepoProvider.ts";
import {
    normalizeGiteaHostBaseUrl,
    normalizeOptionalHeaderValue,
} from "@/core/persistence/giteaConfig.ts";
import { OpfsGitFs } from "@/web/adapters/git/OpfsGitFs.ts";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";
import { createBrowserSettingsManager } from "@/web/domain/settings.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";
import { OpfsFileSystem } from "@/web/persistence/OpfsFileSystem.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";
import { resolveWebStorageNamespace } from "@/web/persistence/storageNamespace.ts";
import { WebImportService } from "@/web/persistence/WebImportService.ts";
import { WebOpener } from "@/web/persistence/WebOpener.ts";

/**
 * Web bootstrap.
 *
 * Like the desktop entrypoint, this file assembles platform-specific adapters and
 * hands them to the shared app. The rest of the product should keep talking to
 * shared service contracts instead of OPFS, browser settings, or web-only git
 * details directly.
 */
const settingsManager = createBrowserSettingsManager();
applyColorSchemeToDocument(settingsManager.get("colorScheme") ?? "light");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);
const platform: PlatformAndWeb = "web";
const giteaHostBaseUrl = normalizeGiteaHostBaseUrl(
    import.meta.env.VITE_GITEA_WEB_HOST,
);
const gitCorsProxyUrl = normalizeGiteaHostBaseUrl(
    import.meta.env.VITE_GIT_CORS_PROXY_URL,
);
const gitProxyRequestedWithHeaderValue = normalizeOptionalHeaderValue(
    import.meta.env.VITE_GIT_PROXY_X_REQUESTED_WITH,
);
const storageRoots = new OpfsStorageRoots();
const fileSystem = new OpfsFileSystem(storageRoots);
const authSessionProvider = new FsBackedAuthSessionProvider(
    fileSystem,
    storageRoots,
    undefined,
    platform,
);
const gitProvider = new WebGitProvider(new OpfsGitFs(), {
    corsProxyUrl: gitCorsProxyUrl,
    requestedWithHeaderValue: gitProxyRequestedWithHeaderValue,
});
const remoteRepoProvider = new GiteaRemoteRepoProvider();
const opener = new WebOpener(fileSystem);
const projectIndex = new DexieProjectIndex(
    buildProjectIndexDbName(resolveWebStorageNamespace()),
);
const libraryService = new DefaultLibraryService({
    fileSystem,
    roots: storageRoots,
    projectIndex,
    md5Service: webMd5Service,
    gitProvider,
    remote: {
        authSessionProvider,
        remoteRepoProvider,
    },
});
const projectsService = libraryService;
const importService = new WebImportService(
    storageRoots,
    projectsService,
    fileSystem,
);
initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
root.render(
    <StrictMode>
        <App
            settingsManager={settingsManager}
            fileSystem={fileSystem}
            authSessionProvider={authSessionProvider}
            giteaHostBaseUrl={giteaHostBaseUrl}
            storageRoots={storageRoots}
            usfmOnionService={webUsfmOnionService}
            gitProvider={gitProvider}
            opener={opener}
            platform={platform}
            projectsService={projectsService}
            libraryService={libraryService}
            importService={importService}
        />
    </StrictMode>,
);
