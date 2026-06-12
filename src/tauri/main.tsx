import { platform } from "@tauri-apps/plugin-os";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import type { PlatformAndWeb } from "@/app/data/constants.ts";
import { App } from "@/app/entrypoint.tsx";
import { DefaultLibraryService } from "@/app/library/DefaultLibraryService.ts";
import {
  buildProjectIndexDbName,
  DexieProjectIndex,
} from "@/app/persistence/DexieProjectIndex.ts";
import { installDevTimerLogger } from "@/app/ui/hooks/utils/domUtils.ts";
import { applyColorSchemeToDocument } from "@/app/ui/theme/appTheme.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { FsBackedAuthSessionProvider } from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import { normalizeGiteaHostBaseUrl } from "@/core/persistence/giteaConfig.ts";
import { GiteaRemoteRepoProvider } from "@/core/persistence/GiteaRemoteRepoProvider.ts";
import { TauriGitProvider } from "@/tauri/adapters/git/TauriGitProvider.ts";
import { TauriMd5Service } from "@/tauri/domain/md5/TauriMd5Service.ts";
import { createTauriSettingsManager } from "@/tauri/domain/settings/settings.ts";
import { TauriSousService } from "@/tauri/domain/sous/TauriSousService.ts";
import { TauriUpdaterService } from "@/tauri/domain/updater/TauriUpdaterService.ts";
import { TauriUsfmOnionService } from "@/tauri/domain/usfm/TauriUsfmOnionService.ts";
import { TauriFileSystem } from "@/tauri/persistence/TauriFileSystem.ts";
import { TauriImportService } from "@/tauri/persistence/TauriImportService.ts";
import { TauriOpener } from "@/tauri/persistence/TauriOpener.ts";
import { TauriStorageRoots } from "@/tauri/persistence/TauriStorageRoots.ts";

/**
 * Desktop bootstrap.
 *
 * This is where the platform-specific adapters are assembled and passed into the
 * shared app. Upstream product logic should not need to know about Tauri or Rust;
 * it receives only the shared service interfaces defined under `src/core` and
 * `src/app`.
 */
const settingsManager = createTauriSettingsManager();
applyColorSchemeToDocument(settingsManager.get("colorScheme") ?? "light");
installDevTimerLogger();
const giteaHostBaseUrl = normalizeGiteaHostBaseUrl(
  import.meta.env.VITE_GITEA_DESKTOP_HOST,
);
const storageRoots = await TauriStorageRoots.create();
const fileSystem = new TauriFileSystem(storageRoots);
const currentPlatform: PlatformAndWeb = platform();
const authSessionProvider = new FsBackedAuthSessionProvider(
  fileSystem,
  storageRoots,
  undefined,
  currentPlatform,
);
const md5Service = new TauriMd5Service();
const usfmOnionService = new TauriUsfmOnionService();
const sousService = new TauriSousService();
const gitProvider = new TauriGitProvider();
const remoteRepoProvider = new GiteaRemoteRepoProvider();
const opener = new TauriOpener(fileSystem);
const projectIndex = new DexieProjectIndex(buildProjectIndexDbName());
const libraryService = new DefaultLibraryService({
  fileSystem,
  roots: storageRoots,
  projectIndex,
  md5Service,
  gitProvider,
  remote: {
    authSessionProvider,
    remoteRepoProvider,
  },
});
const projectsService = libraryService;
const importService = new TauriImportService(
  storageRoots,
  projectsService,
  fileSystem,
  import.meta.env.VITE_GIT_PROXY_X_REQUESTED_WITH ?? null,
);
initializeUsfmMarkerCatalog(await usfmOnionService.getMarkerCatalog());
const updaterService = new TauriUpdaterService();
await updaterService.initialize();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <App
      settingsManager={settingsManager}
      fileSystem={fileSystem}
      md5Service={md5Service}
      authSessionProvider={authSessionProvider}
      giteaHostBaseUrl={giteaHostBaseUrl}
      storageRoots={storageRoots}
      projectsService={projectsService}
      libraryService={libraryService}
      importService={importService}
      usfmOnionService={usfmOnionService}
      sousService={sousService}
      gitProvider={gitProvider}
      opener={opener}
      platform={currentPlatform}
      updaterService={updaterService}
    />
  </StrictMode>,
);
