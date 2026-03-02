import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import type { PlatformAndWeb } from "@/app/data/constants.ts";
import { App } from "@/app/entrypoint.tsx";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";
import { createBrowserSettingsManager } from "@/web/domain/settings.ts";
import type { WebWriteBackendMode } from "@/web/persistence/WebDirectoryProvider.ts";
import { WebDirectoryProvider } from "@/web/persistence/WebDirectoryProvider.ts";
import { WebOpener } from "@/web/persistence/WebOpener.ts";
import { WebZenFsRuntime } from "@/web/zenfs/WebZenFsRuntime.ts";

// instantiante services
const settingsManager = createBrowserSettingsManager();

// react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);
const platform: PlatformAndWeb = "web";
const WEB_WRITE_BACKEND_MODE: WebWriteBackendMode = "zenfs";
const zenFsRuntime = new WebZenFsRuntime();
const directoryProvider = await WebDirectoryProvider.create({
    zenFsRuntime,
    writeBackendMode: WEB_WRITE_BACKEND_MODE,
});
const gitProvider = new WebGitProvider(zenFsRuntime);
const opener = new WebOpener();
root.render(
    <StrictMode>
        <App
            settingsManager={settingsManager}
            directoryProvider={directoryProvider}
            md5Service={webMd5Service}
            gitProvider={gitProvider}
            opener={opener}
            platform={platform}
        />
    </StrictMode>,
);
