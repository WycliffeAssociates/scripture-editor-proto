import "./App.css";
import "./Usfm.css";
import {i18n} from "@lingui/core";
import {I18nProvider} from "@lingui/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createRouter, RouterProvider} from "@tanstack/react-router";
import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {messages as enMessages} from "./locales/en/messages";
import {messages as esMessages} from "./locales/es/messages";

// import App from "./App";

import {getProjectsDir} from "./contexts/RouterContext";
// Import the generated route tree
import {routeTree} from "./routeTree.gen";

// Create a client for React Query
const queryClient = new QueryClient();

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
    dirs: {
      projects: "",
    },
    pathSeparator: "",
  },
});

// Load i18n messages
i18n.load({
  en: enMessages,
  es: esMessages,
});
i18n.activate(localStorage.getItem("language") || "en");

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function bootstrap() {
  const rootElement = document.getElementById("root");
  if (!rootElement || rootElement.innerHTML) return;

  // wait for dirs
  const ctx = await getProjectsDir();

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    // <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={ctx} />
      </QueryClientProvider>
    </I18nProvider>
    // </StrictMode>
  );
}

bootstrap();
