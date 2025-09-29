import {
    queryOptions,
    type UseQueryResult,
    useQuery,
} from "@tanstack/react-query";
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { toast } from "sonner";
import type { RouterContext } from "@/contexts/RouterContext";
import type { ParsedFile, ProjectFile } from "@/customTypes/types";
import { getSerializedLexicalNodes } from "@/lib/getEditorState";
import { type ParsedToken, parseUSFM } from "@/lib/parse";
import {
    getLocalizedBookNameFromManifest,
    sortBasedOnManifest,
} from "@/utils/resourceContainer";
import { parseResourceContainer } from "../utils/resourceContainer";

export function useProjects(context: RouterContext) {
    return useQuery({
        queryKey: ["projects"],
        queryFn: async () => {
            const entries = await readDir(context.dirs.projects);
            return entries
                .filter((entry) => entry.isDirectory)
                .map((entry) => ({
                    name: entry.name || "Unnamed Project",
                    path: `${context.dirs.projects}${context.pathSeparator}${entry.name}`,
                }));
        },
    });
}
// export function useProjectFiles(
//   files: ProjectFile[],
//   projectId: string
// ): UseQueryResult<ParsedFile[]> {
//   // const loadedFiles = await Promise.
//   return useQuery({
//     queryKey: ["projectFiles", projectId],
//     queryFn: async () => {
//       console.time("useProjectFiles");
//       const fileData = await Promise.all(
//         files.map(async (file) => {
//           return {
//             ...file,
//             content: await readTextFile(file.path),
//           };
//         })
//       );
//       const parsed = fileData.map((file) => {
//         const parsed = parseUSFM(file.content).chapters;
//         // console.log(parsed);
//         return {
//           ...file,
//           chapters: Object.entries(parsed).reduce(
//             (acc, [chapter, tokens]) => {
//               acc[chapter] = {
//                 tokens: tokens,
//                 lexicalState: getSerializedLexicalNodes(tokens),
//                 dirty: false,
//               };
//               return acc;
//             },
//             {} as Record<
//               string,
//               {
//                 tokens: ParsedToken[];
//                 lexicalState: SerializedEditorState<SerializedLexicalNode>;
//                 dirty: boolean;
//               }
//             >
//           ),
//         };
//       });
//       console.timeEnd("useProjectFiles");
//       return parsed;
//     },
//     enabled: !!projectId,
//   });
// }

async function fetchProjectFiles(
    projectId: string,
    pathSeparator: string,
): Promise<ParsedFile[]> {
    const entries = await readDir(projectId);

    const usfmFiles = entries
        .filter(
            (entry) =>
                entry.isFile &&
                (entry.name.endsWith(".usfm") || entry.name.endsWith(".sfm")),
        )
        .map((entry) => ({
            name: entry.name.replace(/\.u?sfm$/, ""),
            path: `${projectId}${pathSeparator}${entry.name}`,
        }));

    try {
        const manifest = await readTextFile(
            `${projectId}${pathSeparator}manifest.yaml`,
        );

        const withLocalizedNames = usfmFiles.map((file) =>
            getLocalizedBookNameFromManifest({
                bookName: file.name,
                filePath: file.path,
                resourceContainer: parseResourceContainer(manifest),
            }),
        );

        sortBasedOnManifest(withLocalizedNames);

        console.time(`fs read for ${projectId}`);
        const fileData = await Promise.all(
            withLocalizedNames.map(async (file) => {
                return {
                    ...file,
                    content: await readTextFile(file.path),
                };
            }),
        );
        console.timeEnd(`fs read for ${projectId}`);
        console.time("lex and light parse");
        const parsed = fileData.map((file) => {
            const parsed = parseUSFM(file.content).chapters;
            // console.log(parsed);
            return {
                ...file,
                chapters: Object.entries(parsed).reduce(
                    (acc, [chapter, tokens]) => {
                        acc[chapter] = {
                            tokens: tokens,
                            lexicalState: getSerializedLexicalNodes(tokens),
                            dirty: false,
                        };
                        return acc;
                    },
                    {} as Record<
                        string,
                        {
                            tokens: ParsedToken[];
                            lexicalState: SerializedEditorState<SerializedLexicalNode>;
                            dirty: boolean;
                        }
                    >,
                ),
            };
        });
        console.timeEnd("lex and light parse");
        return parsed;
    } catch (error) {
        console.error(error);
        toast.error(String(error), { duration: 5000 });
        throw error;
    }
}
export const projectFilesQueryOptions = (
    projectId: string,
    pathSeparator: string,
) =>
    queryOptions({
        queryKey: ["projectFiles", { projectId, pathSeparator }],
        queryFn: () => fetchProjectFiles(projectId, pathSeparator),
    });
export function useProjectFiles(
    projectId: string | null,
    pathSeparator: string,
) {
    return useQuery({
        ...projectFilesQueryOptions(projectId ?? "disabled", pathSeparator),
        enabled: !!projectId, // don't run unless we have an id
    });
}

// type UseProjectFilesArgs = {
//   projectPath: string;
// };
// export function useProjectFiles({projectPath}: UseProjectFilesArgs) {
//   return useQuery({
//     queryKey: ["projectFiles", projectPath],

//     queryFn: async () => {
//       const entries = await readDir(projectPath);
//       return entries
//         .filter((entry) => entry.isFile && entry.name.endsWith(".sfm"))
//         .map((entry) => entry.name);
//     },
//   });
// }
