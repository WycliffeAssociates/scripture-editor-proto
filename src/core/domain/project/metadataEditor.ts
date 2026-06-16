import { stringify } from "yaml";

import { BIBLE_ENGLISH_VERSIFICATION_EXPECTED_CHAPTERS } from "@/core/data/bible/bible.ts";
import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import {
  canonicalBookMap,
  getCanonicalBook,
} from "@/core/domain/project/bookMapping.ts";
import {
  parseResourceContainer,
  type ResourceContainer,
  type ResourceContainerProject,
} from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import type {
  Ingredient,
  ScriptureBurritoMetadata,
} from "@/core/domain/project/scriptureBurritoSchemas.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

export type MetadataIssue = {
  code:
    | "invalid-resource-container"
    | "invalid-scripture-burrito"
    | "missing-project-file"
    | "missing-ingredient-file";
  message: string;
  fieldPath: string;
  bookCode?: string;
  currentValue?: string;
  suggestedValue?: string;
};

export type ResourceContainerMetadataDraft = {
  kind: "resource-container";
  language: {
    direction: string;
    identifier: string;
    title: string;
  };
  description: string;
  projects: Array<{
    title: string;
    identifier: string;
    sort: string;
    path: string;
    suggestedIdentifier?: string;
    suggestedSort?: string;
    suggestedPath?: string;
  }>;
};

export type ScriptureBurritoMetadataDraft = {
  kind: "scripture-burrito";
  language: {
    tag: string;
    englishName: string;
    localName: string;
    localNameLocale: string;
    direction: "ltr" | "rtl";
  };
  meta: {
    dateCreated: string;
    confidential: boolean;
  };
  localizedNamesText: string;
  ingredients: Array<{
    path: string;
    bookCode: string;
    title: string;
  }>;
};

export type MetadataEditorDraft =
  | ResourceContainerMetadataDraft
  | ScriptureBurritoMetadataDraft;

export type MetadataEditorDocument = {
  managedPath: string;
  metadataPath: string;
  displayName: string;
  issues: MetadataIssue[];
  draft: MetadataEditorDraft;
};

function isUsfmFile(path: string): boolean {
  return path.toLowerCase().endsWith(".usfm");
}

async function listFilesRecursive(
  fs: FileSystem,
  rootPath: string,
): Promise<string[]> {
  const entries = await fs.list(rootPath);

  const results = await Promise.all(
    entries.map(async (entry) => {
      if (entry.kind === "directory") {
        return listFilesRecursive(fs, entry.path);
      }
      return [entry.path];
    }),
  );

  return results.flat();
}

function toProjectRelativePath(
  projectRootPath: string,
  fullPath: string,
): string {
  const withoutRoot = fullPath.startsWith(`${projectRootPath}/`)
    ? fullPath.slice(projectRootPath.length + 1)
    : fullPath;
  return withoutRoot;
}

function guessBookCodeFromPath(inputPath: string): string | null {
  const upper = inputPath.toUpperCase();
  const directMatch = upper.match(
    /(?:^|[^A-Z0-9])((?:[1-3][A-Z]{2}|[A-Z]{3}))(?:[^A-Z]|$)/u,
  );
  if (directMatch?.[1] && canonicalBookMap[directMatch[1]]) {
    return directMatch[1];
  }

  let lastMatch: { code: string; index: number } | null = null;
  for (const code of Object.keys(canonicalBookMap)) {
    const index = upper.lastIndexOf(code);
    if (index >= 0 && (!lastMatch || index > lastMatch.index)) {
      lastMatch = { code, index };
    }
  }

  return lastMatch?.code ?? null;
}

function createRcProjectSuggestion(
  projectRootPath: string,
  filePath: string,
): Pick<ResourceContainerProject, "identifier" | "sort" | "path"> | null {
  const relativePath = toProjectRelativePath(projectRootPath, filePath);
  const bookCode = guessBookCodeFromPath(relativePath);
  if (!bookCode) return null;
  const canonical = getCanonicalBook(bookCode);

  return {
    identifier: canonical.code.toLowerCase(),
    sort: Number(canonical.num),
    path: `./${relativePath}`,
  };
}

type RcProjectSuggestion = Pick<
  ResourceContainerProject,
  "identifier" | "sort" | "path"
>;

function findRcProjectSuggestion(args: {
  projectRootPath: string;
  project: Partial<ResourceContainerProject>;
  usfmFiles: string[];
}): RcProjectSuggestion | null {
  return (
    args.usfmFiles
      .map((filePath) =>
        createRcProjectSuggestion(args.projectRootPath, filePath),
      )
      .find((candidate) => {
        if (!candidate) return false;
        if (
          args.project.identifier &&
          candidate.identifier === args.project.identifier.toLowerCase()
        ) {
          return true;
        }

        const pathBookCode = guessBookCodeFromPath(args.project.path ?? "");
        if (
          pathBookCode &&
          candidate.identifier === pathBookCode.toLowerCase()
        ) {
          return true;
        }

        const titleBookCode = guessBookCodeFromPath(args.project.title ?? "");
        return titleBookCode
          ? candidate.identifier === titleBookCode.toLowerCase()
          : false;
      }) ?? null
  );
}

async function buildRcIssues(args: {
  fs: FileSystem;
  projectRootPath: string;
  manifest: Partial<ResourceContainer>;
}): Promise<MetadataIssue[]> {
  const files = await listFilesRecursive(args.fs, args.projectRootPath);
  const usfmFiles = files.filter(isUsfmFile);

  const maybeIssues = await Promise.all(
    (args.manifest.projects ?? []).map(
      async (project, index): Promise<MetadataIssue | null> => {
        const relativePath = removeLeadingDirSlashes(project.path ?? "");
        const fullPath = `${args.projectRootPath}/${relativePath}`;
        if (relativePath && (await args.fs.exists(fullPath))) return null;

        const suggested = findRcProjectSuggestion({
          projectRootPath: args.projectRootPath,
          project,
          usfmFiles,
        });

        return {
          code: "missing-project-file",
          message: `Manifest entry "${project.title || project.identifier || index + 1}" points to a file that does not exist.`,
          fieldPath: `projects[${index}].path`,
          bookCode: project.identifier?.toUpperCase(),
          currentValue: project.path ?? "",
          suggestedValue: suggested?.path,
        };
      },
    ),
  );

  return maybeIssues.filter((issue): issue is MetadataIssue => issue !== null);
}

async function buildRcDraftProjects(args: {
  fs: FileSystem;
  projectRootPath: string;
  manifest: Partial<ResourceContainer>;
}): Promise<ResourceContainerMetadataDraft["projects"]> {
  const usfmFiles = (
    await listFilesRecursive(args.fs, args.projectRootPath)
  ).filter(isUsfmFile);

  return (args.manifest.projects ?? []).map((project) => {
    const suggested = findRcProjectSuggestion({
      projectRootPath: args.projectRootPath,
      project,
      usfmFiles,
    });
    const relativePath = removeLeadingDirSlashes(project.path ?? "");
    const hasValidPath = relativePath
      ? usfmFiles.some(
          (fullPath) =>
            toProjectRelativePath(args.projectRootPath, fullPath) ===
            relativePath,
        )
      : false;

    return {
      title: project.title ?? "",
      identifier: project.identifier ?? "",
      sort:
        project.sort == null || Number.isNaN(Number(project.sort))
          ? ""
          : String(project.sort),
      path: project.path ?? "",
      suggestedIdentifier:
        hasValidPath || !suggested ? undefined : suggested.identifier,
      suggestedSort:
        hasValidPath || !suggested ? undefined : String(suggested.sort),
      suggestedPath: hasValidPath || !suggested ? undefined : suggested.path,
    };
  });
}

async function loadResourceContainerEditor(args: {
  fs: FileSystem;
  managedPath: string;
  displayName: string;
  includeIssues: boolean;
}): Promise<MetadataEditorDocument> {
  const metadataPath = `${args.managedPath}/manifest.yaml`;
  const contents = await args.fs.readText(metadataPath);

  let manifest: Partial<ResourceContainer>;
  try {
    manifest = parseResourceContainer(contents);
  } catch {
    return {
      managedPath: args.managedPath,
      metadataPath,
      displayName: args.displayName,
      issues: args.includeIssues
        ? [
            {
              code: "invalid-resource-container",
              message:
                "manifest.yaml could not be parsed. Fix the YAML before this project can open normally.",
              fieldPath: "manifest.yaml",
            },
          ]
        : [],
      draft: {
        kind: "resource-container",
        language: { direction: "ltr", identifier: "", title: "" },
        description: "",
        projects: [],
      },
    };
  }

  return {
    managedPath: args.managedPath,
    metadataPath,
    displayName: args.displayName,
    issues: args.includeIssues
      ? await buildRcIssues({
          fs: args.fs,
          projectRootPath: args.managedPath,
          manifest,
        })
      : [],
    draft: {
      kind: "resource-container",
      language: {
        direction: manifest.dublin_core?.language?.direction ?? "ltr",
        identifier: manifest.dublin_core?.language?.identifier ?? "",
        title: manifest.dublin_core?.language?.title ?? "",
      },
      description: manifest.dublin_core?.description ?? "",
      projects: await buildRcDraftProjects({
        fs: args.fs,
        projectRootPath: args.managedPath,
        manifest,
      }),
    },
  };
}

function buildSbIngredientRows(
  metadata: ScriptureBurritoMetadata,
): ScriptureBurritoMetadataDraft["ingredients"] {
  return Object.entries(metadata.ingredients ?? {}).map(
    ([path, ingredient]) => ({
      path,
      bookCode: guessBookCodeFromPath(path) ?? "",
      title:
        "title" in ingredient && typeof ingredient.title === "string"
          ? ingredient.title
          : "",
    }),
  );
}

async function buildSbIssues(args: {
  fs: FileSystem;
  managedPath: string;
  metadata: ScriptureBurritoMetadata;
}): Promise<MetadataIssue[]> {
  const maybeIssues = await Promise.all(
    Object.keys(args.metadata.ingredients ?? {}).map(
      async (path): Promise<MetadataIssue | null> => {
        const relativePath = removeLeadingDirSlashes(path);
        const fullPath = `${args.managedPath}/${relativePath}`;
        if (await args.fs.exists(fullPath)) return null;

        return {
          code: "missing-ingredient-file",
          message: `Ingredient "${path}" points to a file that does not exist.`,
          fieldPath: `ingredients.${path}`,
          currentValue: path,
        };
      },
    ),
  );

  return maybeIssues.filter((issue): issue is MetadataIssue => issue !== null);
}

async function loadScriptureBurritoEditor(args: {
  fs: FileSystem;
  managedPath: string;
  displayName: string;
  includeIssues: boolean;
}): Promise<MetadataEditorDocument> {
  const metadataPath = `${args.managedPath}/metadata.json`;
  const contents = await args.fs.readText(metadataPath);

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(contents);
  } catch {
    return {
      managedPath: args.managedPath,
      metadataPath,
      displayName: args.displayName,
      issues: args.includeIssues
        ? [
            {
              code: "invalid-scripture-burrito",
              message:
                "metadata.json could not be parsed. Fix the JSON before this project can open normally.",
              fieldPath: "metadata.json",
            },
          ]
        : [],
      draft: {
        kind: "scripture-burrito",
        language: {
          tag: "",
          englishName: "",
          localName: "",
          localNameLocale: "",
          direction: "ltr",
        },
        meta: {
          dateCreated: "",
          confidential: false,
        },
        localizedNamesText: "{}",
        ingredients: [],
      },
    };
  }

  const metadata = rawMetadata as ScriptureBurritoMetadata;
  const language = metadata.languages?.[0];
  const tag = language?.tag ?? "";

  return {
    managedPath: args.managedPath,
    metadataPath,
    displayName: args.displayName,
    issues: args.includeIssues
      ? await buildSbIssues({
          fs: args.fs,
          managedPath: args.managedPath,
          metadata,
        })
      : [],
    draft: {
      kind: "scripture-burrito",
      language: {
        tag,
        englishName: language?.name?.en ?? "",
        localName: tag ? (language?.name?.[tag] ?? "") : "",
        localNameLocale: tag,
        direction: language?.scriptDirection === "rtl" ? "rtl" : "ltr",
      },
      meta: {
        dateCreated: metadata.meta?.dateCreated ?? "",
        confidential: Boolean(
          (metadata as { confidential?: boolean }).confidential,
        ),
      },
      localizedNamesText: JSON.stringify(
        metadata.localizedNames ?? {},
        null,
        2,
      ),
      ingredients: buildSbIngredientRows(metadata),
    },
  };
}

export async function loadMetadataEditorDocument(args: {
  fs: FileSystem;
  managedPath: string;
  displayName: string;
  includeIssues: boolean;
}): Promise<MetadataEditorDocument | null> {
  const metadataPath = `${args.managedPath}/metadata.json`;
  if (await args.fs.exists(metadataPath)) {
    return loadScriptureBurritoEditor(args);
  }

  const manifestPath = `${args.managedPath}/manifest.yaml`;
  if (await args.fs.exists(manifestPath)) {
    return loadResourceContainerEditor(args);
  }

  return null;
}

function normalizeRcDraft(
  draft: ResourceContainerMetadataDraft,
): Partial<ResourceContainer> {
  return {
    dublin_core: {
      conformsto: "rc0.2",
      contributor: [],
      creator: "",
      description: draft.description,
      format: "text/usfm",
      identifier: "",
      issued: "",
      modified: "",
      publisher: "Wycliffe Associates",
      relation: [],
      rights: "",
      subject: "Bible",
      title: "",
      type: "bundle",
      version: "0.1",
      source: [],
      language: {
        direction: draft.language.direction,
        identifier: draft.language.identifier,
        title: draft.language.title,
      },
    },
    checking: {
      checking_entity: [],
      checking_level: "",
    },
    projects: draft.projects.map((project) => ({
      title: project.title,
      identifier: project.identifier.toLowerCase(),
      sort: project.sort ? Number(project.sort) : undefined,
      path: project.path,
      categories: [],
    })) as ResourceContainerProject[],
  };
}

function normalizeLocalizedNamesText(
  localizedNamesText: string,
): Record<string, unknown> {
  const trimmed = localizedNamesText.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
}

async function readFileStatPayload(
  fs: FileSystem,
  fullPath: string,
): Promise<{ text: string; size: number }> {
  const text = await fs.readText(fullPath);
  return {
    text,
    size: text.length,
  };
}

function deriveScopeFromBookCode(bookCode: string): Record<string, []> {
  const canonical = getCanonicalBook(bookCode);
  if (canonical.code in BIBLE_ENGLISH_VERSIFICATION_EXPECTED_CHAPTERS) {
    return {
      [canonical.code]:
        [] as (typeof BIBLE_ENGLISH_VERSIFICATION_EXPECTED_CHAPTERS)[keyof typeof BIBLE_ENGLISH_VERSIFICATION_EXPECTED_CHAPTERS] extends number
          ? []
          : never,
    };
  }
  return { [canonical.code]: [] };
}

function buildCurrentScope(
  ingredients: Record<string, Ingredient>,
): Record<string, []> {
  const scope: Record<string, []> = {};
  for (const path of Object.keys(ingredients)) {
    const bookCode = guessBookCodeFromPath(path);
    if (!bookCode) continue;
    scope[bookCode] = [];
  }
  return scope;
}

async function normalizeSbDraft(args: {
  fs: FileSystem;
  managedPath: string;
  draft: ScriptureBurritoMetadataDraft;
  md5Service: IMd5Service;
  appVersion: string;
}): Promise<ScriptureBurritoMetadata> {
  const localeTag =
    args.draft.language.localNameLocale || args.draft.language.tag;
  const ingredientPairs = await Promise.all(
    args.draft.ingredients.map(async (ingredientRow) => {
      const relativePath = removeLeadingDirSlashes(ingredientRow.path);
      if (!relativePath) return null;
      const fullPath = `${args.managedPath}/${relativePath}`;
      const { text, size } = await readFileStatPayload(args.fs, fullPath);
      const checksum = await args.md5Service.calculateMd5(text);
      const bookCode =
        ingredientRow.bookCode || guessBookCodeFromPath(relativePath);
      return [
        relativePath,
        {
          checksum: { md5: checksum },
          size,
          mimeType: "text/x-usfm",
          scope: bookCode ? deriveScopeFromBookCode(bookCode) : undefined,
          title: ingredientRow.title || bookCode || relativePath,
        } as Ingredient,
      ] as const;
    }),
  );

  const ingredients: Record<string, Ingredient> = Object.fromEntries(
    ingredientPairs.filter(
      (pair): pair is [string, Ingredient] => pair !== null,
    ),
  );

  return {
    format: "scripture burrito",
    meta: {
      version: "1.0.0",
      category: "source",
      generator: {
        softwareName: "Zephyr",
        softwareVersion: args.appVersion,
      },
      defaultLocale: "en",
      dateCreated: args.draft.meta.dateCreated || new Date().toISOString(),
      normalization: "NFC",
    },
    idAuthorities: {
      wycliffeassociates: {
        id: "https://content.bibletranslationtools.org",
        name: {
          en: "Wycliffe Associates Content Services",
        },
      },
    },
    identification: {
      primary: {},
      name: {
        en: "Bible",
        ...(localeTag ? { [localeTag]: "" } : {}),
      },
      abbreviation: {
        en: "Bible",
        ...(localeTag ? { [localeTag]: "" } : {}),
      },
    },
    confidential: args.draft.meta.confidential,
    languages: [
      {
        tag: args.draft.language.tag,
        name: {
          en: args.draft.language.englishName,
          ...(localeTag ? { [localeTag]: args.draft.language.localName } : {}),
        },
        scriptDirection: args.draft.language.direction,
      },
    ],
    type: {
      flavorType: {
        name: "scripture",
        flavor: {
          name: "textTranslation",
          projectType: "standard",
          translationType: "newTranslation",
          audience: "common",
          usfmVersion: "3.0",
        },
        currentScope: buildCurrentScope(ingredients),
      },
    },
    localizedNames: normalizeLocalizedNamesText(args.draft.localizedNamesText),
    ingredients,
    copyright: {
      licenses: [{ ingredient: "LICENSE.md" }],
    },
  } as ScriptureBurritoMetadata;
}

export async function saveMetadataEditorDocument(args: {
  fs: FileSystem;
  managedPath: string;
  draft: MetadataEditorDraft;
  md5Service: IMd5Service;
  appVersion: string;
}): Promise<void> {
  if (args.draft.kind === "resource-container") {
    const metadataPath = `${args.managedPath}/manifest.yaml`;
    await args.fs.writeText(
      metadataPath,
      stringify(normalizeRcDraft(args.draft)),
    );
    return;
  }

  const metadataPath = `${args.managedPath}/metadata.json`;
  const normalized = await normalizeSbDraft({
    fs: args.fs,
    managedPath: args.managedPath,
    draft: args.draft,
    md5Service: args.md5Service,
    appVersion: args.appVersion,
  });
  await args.fs.writeText(metadataPath, JSON.stringify(normalized, null, 2));
}
