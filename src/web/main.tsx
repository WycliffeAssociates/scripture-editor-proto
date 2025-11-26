import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import type { PlatformAndWeb } from "@/app/data/constants.ts";
import { App } from "@/app/entrypoint.tsx";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import { createBrowserSettingsManager } from "@/web/domain/settings.ts";
import { WebDirectoryProvider } from "@/web/persistence/WebDirectoryProvider.ts";
import { WebOpener } from "@/web/persistence/WebOpener.ts";

// instantiante services
const settingsManager = createBrowserSettingsManager();

// react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);
const platform: PlatformAndWeb = "web";
const directoryProvider = await WebDirectoryProvider.create();
const opener = new WebOpener();
root.render(
  <StrictMode>
    <App
      settingsManager={settingsManager}
      directoryProvider={directoryProvider}
      md5Service={webMd5Service}
      opener={opener}
      platform={platform}
    />
  </StrictMode>,
);
