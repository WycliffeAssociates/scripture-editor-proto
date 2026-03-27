import { platform } from "@tauri-apps/plugin-os";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/entrypoint.tsx";
import { DefaultLibraryService } from "@/app/library/DefaultLibraryService.ts";
import {
    buildProjectIndexDbName,
    DexieProjectIndex,
} from "@/app/persistence/DexieProjectIndex.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { TauriGitProvider } from "@/tauri/adapters/git/TauriGitProvider.ts";
import { TauriMd5Service } from "@/tauri/domain/md5/TauriMd5Service.ts";
import { createTauriSettingsManager } from "@/tauri/domain/settings/settings.ts";
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
const storageRoots = await TauriStorageRoots.create();
const fileSystem = new TauriFileSystem(storageRoots);
const md5Service = new TauriMd5Service();
const usfmOnionService = new TauriUsfmOnionService();
const gitProvider = new TauriGitProvider();
const opener = new TauriOpener(fileSystem);
const projectIndex = new DexieProjectIndex(buildProjectIndexDbName());
const libraryService = new DefaultLibraryService(
    fileSystem,
    storageRoots,
    projectIndex,
    md5Service,
    gitProvider,
);
const projectsService = libraryService;
const importService = new TauriImportService(
    storageRoots,
    projectsService,
    fileSystem,
);
initializeUsfmMarkerCatalog(await usfmOnionService.getMarkerCatalog());

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
    <StrictMode>
        <App
            settingsManager={settingsManager}
            fileSystem={fileSystem}
            storageRoots={storageRoots}
            projectsService={projectsService}
            libraryService={libraryService}
            importService={importService}
            usfmOnionService={usfmOnionService}
            gitProvider={gitProvider}
            opener={opener}
            platform={platform()}
        />
    </StrictMode>,
);
