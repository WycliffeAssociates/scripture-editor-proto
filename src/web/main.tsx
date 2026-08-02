import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import type { PlatformAndWeb } from "@/app/data/constants.ts";
import type { MirrorSessionFactory } from "@/app/domain/mirror/mirrorSessionFactory.ts";
import { App } from "@/app/entrypoint.tsx";
import { DefaultLibraryService } from "@/app/library/DefaultLibraryService.ts";
import {
  buildProjectIndexDbName,
  DexieProjectIndex,
} from "@/app/persistence/DexieProjectIndex.ts";
import { installDevTimerLogger } from "@/app/ui/hooks/utils/domUtils.ts";
import { applyColorSchemeToDocument } from "@/app/ui/theme/appTheme.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import { FsBackedAuthSessionProvider } from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import {
  normalizeGiteaHostBaseUrl,
  normalizeOptionalHeaderValue,
} from "@/core/persistence/giteaConfig.ts";
import { GiteaRemoteRepoProvider } from "@/core/persistence/GiteaRemoteRepoProvider.ts";
import { OpfsGitFs } from "@/web/adapters/git/OpfsGitFs.ts";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";
import { WorkerMirrorSession } from "@/web/domain/mirror/WorkerMirrorSession.ts";
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
installDevTimerLogger();
// Dev-only: attach window.grab DevTools helpers (copy selectors / element info
// from the console). Dynamic import keeps it out of the production bundle.
if (import.meta.env.DEV) {
  void import("@/app/ui/dev/domGrab.ts");
}

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
// Web mirror: a module worker holds the token mirror + wasm engines + OPFS
// backup off the main thread. The factory attaches it to the workspace feed.
const mirrorSessionFactory: MirrorSessionFactory = ({
  feed,
  workspaceKey,
  dirtyBufferRoot,
}) => new WorkerMirrorSession({ feed, workspaceKey, dirtyBufferRoot });
root.render(
  <StrictMode>
    <App
      settingsManager={settingsManager}
      fileSystem={fileSystem}
      md5Service={webMd5Service}
      authSessionProvider={authSessionProvider}
      giteaHostBaseUrl={giteaHostBaseUrl}
      storageRoots={storageRoots}
      usfmOnionService={webUsfmOnionService}
      gitProvider={gitProvider}
      opener={opener}
      platform={platform}
      mirrorSessionFactory={mirrorSessionFactory}
      projectsService={projectsService}
      libraryService={libraryService}
      importService={importService}
      updaterService={null}
    />
  </StrictMode>,
);
