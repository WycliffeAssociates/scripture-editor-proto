// this is the tauri entrypoint, and any tauri / rust specific code should be passed into app is props through here: IE App is generic and takes service interfaces:
import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {App} from "@/app/entrypoint";
import {TauriGitProvider} from "@/tauri/domain/git/tauriGitProvider";
import {createTauriSettingsManager} from "@/tauri/domain/settings/settings";
import {TauriDirectoryProvider} from "@/tauri/persistence/TauriDirectoryProvider";

// instantiante services
const settingsManager = createTauriSettingsManager();
const directoryProvider = await TauriDirectoryProvider.create(
  "scripture-editor"
);
const gitProvider = new TauriGitProvider(directoryProvider);

// react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <App
      settingsManager={settingsManager}
      gitProvider={gitProvider}
      directoryProvider={directoryProvider}
    />
  </StrictMode>
);
