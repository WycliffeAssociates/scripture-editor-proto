import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/entrypoint.tsx";
import { createBrowserSettingsManager } from "@/web/domain/settings.ts";
import { WebDirectoryProvider } from "@/web/persistence/WebDirectoryProvider.ts";

// instantiante services
const settingsManager = createBrowserSettingsManager();

// react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

const directoryProvider = await WebDirectoryProvider.create();

root.render(
    <App
        settingsManager={settingsManager}
        gitProvider={undefined}
        directoryProvider={directoryProvider}
        md5Service={undefined}
    />,
);
