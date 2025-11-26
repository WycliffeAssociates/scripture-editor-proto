// this is the tauri entrypoint, and any tauri / rust specific code should be passed into app is props through here: IE App is generic and takes service interfaces:

import { platform } from "@tauri-apps/plugin-os";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/entrypoint.tsx";
import { TauriMd5Service } from "@/tauri/domain/md5/TauriMd5Service.ts";
import { createTauriSettingsManager } from "@/tauri/domain/settings/settings.ts";
import { TauriDirectoryProvider } from "@/tauri/persistence/TauriDirectoryProvider.ts";
import { TauriOpener } from "@/tauri/persistence/TauriOpener.ts";

// // instantiante services
const settingsManager = createTauriSettingsManager();
const directoryProvider =
  await TauriDirectoryProvider.create("scripture-editor");
const md5Service = new TauriMd5Service();
const opener = new TauriOpener();

// // react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <App
      settingsManager={settingsManager}
      directoryProvider={directoryProvider}
      md5Service={md5Service}
      opener={opener}
      platform={platform()}
    />
  </StrictMode>,
);
