import {createFileRoute, Link, useRouter} from "@tanstack/react-router";
// import { Route as ProjectRoute } from '@/app/routes/projects/$projectId.edit';

export const Route = createFileRoute("/")({
  component: Index,
  // loader: async ({context}) => {
  //   const entries = await readDir(context.dirs.projects);
  //   const projectDirs = entries
  //     .filter((entry) => entry.isDirectory)
  //     .map((entry) => ({
  //       name: entry.name || "Unnamed Project",
  //       path: `${context.dirs.projects}${context.pathSeparator}${entry.name}`,
  //     }));
  //   return projectDirs;
  // },
});

// ls the app data dir and show as projects
function Index() {
  const {settingsManager, gitProvider} = useRouter().options.context;
  const testUrl =
    "https://content.bibletranslationtools.org/WycliffeAssociates/en_ulb";

  async function testIt() {
    // const rest = await gitProvider.cloneRepository(testUrl);
    // console.log(rest);
  }
  return (
    <>
      <button type="button" onClick={testIt}>
        Test
      </button>
      <div>
        <h1>Projects</h1>
        <p>
          Settings: {JSON.stringify(settingsManager.getSettings(), null, 2)}
        </p>
      </div>
    </>
  );
}
