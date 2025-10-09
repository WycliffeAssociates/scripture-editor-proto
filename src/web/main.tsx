import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {App} from "@/app/entrypoint";
import {createBrowserSettingsManager} from "@/web/domain/settings";

// instantiante services
const settingsManager = createBrowserSettingsManager();

// react entry stuff
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <App settingsManager={settingsManager} />
  </StrictMode>
);
