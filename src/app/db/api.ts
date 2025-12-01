/**
 * DB API helpers using Dexie for IndexedDB.
 *
 * This module implements query functions for `languages`, `projects`, `files`
 * that can be used with useLiveQuery for reactive queries.
 */

import { db } from "./db.ts";
import type {
  DbFileRow,
  DbLanguage,
  DbProject,
  ProjectComposite,
  ProjectsByLanguageRow,
} from "./types.ts";

/* ---------------------------
   Languages Queries
   --------------------------- */

export const getLanguageByIdentifier = (identifier: string) =>
  db.languages.where("identifier").equals(identifier).first();

export const listLanguages = () => db.languages.orderBy("identifier").toArray();

export const upsertLanguage = async (
  identifier: string,
  title: string | null = null,
  direction: "ltr" | "rtl" | null = "ltr",
): Promise<DbLanguage | undefined> => {
  await db.languages.put({
    identifier,
    title,
    direction,
  });

  const created = await db.languages
    .where("identifier")
    .equals(identifier)
    .first();

  return created;
};

/* ---------------------------
   Projects Queries
   --------------------------- */

export const getProjectByDir = (projectDir: string) =>
  db.projects.where("projectDir").equals(projectDir).first();

export const listProjects = () =>
  db.projects.orderBy("importedAt").reverse().toArray();

export const listProjectsByLanguage = async (): Promise<
  ProjectsByLanguageRow[]
> => {
  const projects = await db.projects.toArray();
  const languages = await db.languages.toArray();

  return projects.map((project) => {
    const language = languages.find((lang) => lang.id === project.languageId);
    return {
      projectId: project.id ?? 0,
      projectIdentifier: project.identifier || "",
      projectTitle: project.title || "",
      projectDir: project.projectDir,
      projectLanguageId: project.languageId || 0,
      projectVersion: project.version || null,
      projectCreatedAt: project.createdAt || "",
      projectImportedAt: project.importedAt || "",
      projectUpdatedAt: project.updatedAt || "",
      languageIdentifier: language?.identifier || "",
      languageTitle: language?.title || "",
      languageDirection: language?.direction || "ltr",
    };
  });
};

export const upsertProject = async (
  projectDir: string,
  opts: {
    identifier?: string | null;
    title?: string | null;
    languageId?: number | null;
    version?: string | null;
  } = {},
): Promise<DbProject | undefined> => {
  const existing = await db.projects
    .where("projectDir")
    .equals(projectDir)
    .first();

  const projectData = {
    projectDir,
    identifier: opts.identifier ?? existing?.identifier ?? null,
    title: opts.title ?? existing?.title ?? null,
    languageId: opts.languageId ?? existing?.languageId ?? null,
    version: opts.version ?? existing?.version ?? null,
  };
  if (existing) {
    await db.projects.update(existing.id, projectData);
  } else {
    await db.projects.add(projectData);
  }

  return await db.projects.where("projectDir").equals(projectDir).first();
};

export const deleteProjectById = async (id: number): Promise<void> => {
  await db.transaction("rw", db.files, db.projects, async () => {
    // Delete dependent files first
    await db.files.where("projectId").equals(id).delete();
    // Delete the project
    await db.projects.delete(id);
  });
};

export const deleteProjectByPath = async (
  projectDir: string,
): Promise<void> => {
  await db.transaction("rw", db.files, db.projects, async () => {
    const project = await db.projects
      .where("projectDir")
      .equals(projectDir)
      .first();
    if (project) {
      // Delete dependent files first
      await db.files
        .where("projectId")
        .equals(project.id ?? 0)
        .delete();
      // Delete the project
      await db.projects.delete(project.id ?? 0);
    }
  });
};

/* ---------------------------
   Files Queries
   --------------------------- */

export const getFileByPath = (pathOnDisk: string) =>
  db.files.where("pathOnDisk").equals(pathOnDisk).first();

export const listFilesForProject = (projectId: number) =>
  db.files.where("projectId").equals(projectId).sortBy("sortOrder");

export const upsertFile = async (
  projectId: number,
  file: {
    identifier?: string | null;
    title?: string | null;
    sortOrder?: number | null;
    relativePath?: string | null;
    pathOnDisk: string;
    fileExtension?: string | null;
  },
): Promise<DbFileRow | null> => {
  await db.files.put({
    projectId,
    identifier: file.identifier ?? null,
    title: file.title ?? null,
    sortOrder: file.sortOrder ?? null,
    relativePath: file.relativePath ?? null,
    pathOnDisk: file.pathOnDisk,
    fileExtension: file.fileExtension ?? null,
  });

  return (
    (await db.files.where("pathOnDisk").equals(file.pathOnDisk).first()) ?? null
  );
};

export const deleteFileByPathOnDisk = async (
  pathOnDisk: string,
): Promise<void> => {
  // Find the file by ID to get its pathOnDisk (primary key)
  const file = await db.files.get(pathOnDisk);
  if (!file) {
    throw new Error(`File with path ${pathOnDisk} not found`);
  }
  // Delete using pathOnDisk (string primary key)
  await db.files.delete(file.pathOnDisk);
};

/* ---------------------------
   Convenience Composites
   --------------------------- */

export const getProjectWithFilesByDir = async (
  projectDir: string,
): Promise<ProjectComposite | null> => {
  const project = await db.projects
    .where("projectDir")
    .equals(projectDir)
    .first();
  if (!project || !project.id) return null;

  const files = await db.files
    .where("projectId")
    .equals(project.id)
    .sortBy("sortOrder");

  let language: DbLanguage | undefined;
  if (project.languageId) {
    language = await db.languages
      .where("id")
      .equals(project.languageId)
      .first();
  }

  return { project, files, language };
};
