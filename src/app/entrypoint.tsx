// import "./App.css";
// import "./ui/styles/";
import "@mantine/core/styles.css";
import "@/app/ui/styles/global.css";
import "@/app/ui/styles/usfm.css";
import {MantineProvider} from "@mantine/core";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createRouter, RouterProvider} from "@tanstack/react-router";
import type {SettingsManager} from "@/app/data/settings";
import {routeTree} from "@/app/generated/routeTree.gen";
import {I18nEntry} from "@/app/ui/i18n/i18nEntry";
import {cssVariablesResolver, theme} from "@/app/ui/styles/mantineTheme";
import type {IDirectoryProvider} from "@/core/data/persistence/DirectoryProvider";
import type {IGitProvider} from "@/core/persistence/git/GitProvider";

type EntryPointProps = {
  settingsManager: SettingsManager;
  gitProvider: IGitProvider;
  directoryProvider: IDirectoryProvider;
};

// Create a client for React Query
const queryClient = new QueryClient();
export interface RouterContext {
  queryClient: QueryClient; //for if wanting to manage tanstack query in route loader,
  settingsManager: SettingsManager;
  gitProvider: IGitProvider;
  directoryProvider: IDirectoryProvider;
}
// wrapping this let's us get it's type as ReturnType to declaration merge, whilse just receiving service deps as props to app
const wrapCreateRouter = (
  settingsManager: SettingsManager,
  gitProvider: IGitProvider,
  directoryProvider: IDirectoryProvider
) => {
  const router = createRouter({
    routeTree,
    context: {
      settingsManager,
      queryClient,
      gitProvider,
      directoryProvider,
    },
  });
  return router;
};
declare module "@tanstack/react-router" {
  interface Register {
    // This infers the type of our router and registers it across your entire project
    router: ReturnType<typeof wrapCreateRouter>;
  }
}
export function App({
  settingsManager,
  gitProvider,
  directoryProvider,
}: EntryPointProps) {
  // Create a router
  const router = wrapCreateRouter(
    settingsManager,
    gitProvider,
    directoryProvider
  );

  return (
    <I18nEntry defaultLocale={settingsManager.get("appLanguage")}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          defaultColorScheme={settingsManager.get("colorScheme") || "light"}
        >
          <RouterProvider router={router} />
        </MantineProvider>
      </QueryClientProvider>
    </I18nEntry>
  );
}
