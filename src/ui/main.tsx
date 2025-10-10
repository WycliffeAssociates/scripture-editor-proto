import "./App.css";
import "./Usfm.css";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { messages as enMessages } from "@/ui/i18n/locales/en/messages.ts";
import { messages as esMessages } from "@/ui/i18n/locales/es/messages.ts";

// import App from "./App";

import { getProjectsDir } from "@/ui/contexts/RouterContext.tsx";
// Import the generated route tree
import { routeTree } from "@/routeTree.gen.ts";
import { TauriMd5Service } from "@/api/TauriMd5Service.ts";
import { Md5Provider } from "./contexts/Md5Context.tsx";
import { PersistenceProvider } from "./contexts/PersistenceContext.tsx";
import { TauriDirectoryProvider } from "@/../src/persistence/TauriDirectoryProvider.ts";

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

    // Instantiate TauriMd5Service
    const tauriMd5Service = new TauriMd5Service();

    // wait for dirs
    const ctx = await getProjectsDir();

    const directoryProvider = await TauriDirectoryProvider.create("usfm-editor");

    const root = ReactDOM.createRoot(rootElement);
    root.render(
        // <StrictMode>
        <I18nProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
                <Md5Provider md5Service={tauriMd5Service}>
                    <PersistenceProvider md5Service={tauriMd5Service} directoryProvider={directoryProvider}>
                        <RouterProvider router={router} context={ctx}/>
                    </PersistenceProvider>
                </Md5Provider>
            </QueryClientProvider>
        </I18nProvider>,
        // </StrictMode>
    );
}

bootstrap();
