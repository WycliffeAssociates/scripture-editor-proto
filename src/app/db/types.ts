/**
 * Shared database entity types used across the application.
 * These types define the structure of data stored in IndexedDB via Dexie.
 */

export type DbLanguage = {
  id?: number;
  identifier: string;
  title: string | null;
  direction: "ltr" | "rtl" | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DbProject = {
  id?: number;
  identifier: string | null;
  name: string | null;
  projectDir: string;
  title: string | null;
  languageId: number | null;
  version: string | null;
  createdAt?: string;
  importedAt?: string;
  updatedAt?: string;
};

export type DbFileRow = {
  id?: number;
  projectId: number;
  identifier: string | null;
  title: string | null;
  sortOrder: number | null;
  relativePath: string | null;
  pathOnDisk: string;
  fileExtension: string | null;
  createdAt?: string;
  updatedAt?: string;
};

// Composite types for API responses
export type ProjectsByLanguageRow = {
  projectId: number;
  projectIdentifier: string;
  projectTitle: string;
  projectDir: string;
  languageIdentifier: string;
  languageTitle: string;
  languageDirection: "ltr" | "rtl";
};

export type ProjectComposite = {
  project: DbProject;
  files: DbFileRow[];
  language: DbLanguage | undefined;
};

// Types for hook modifications
export type LanguageModification = {
  updatedAt?: string;
};

export type ProjectModification = {
  updatedAt?: string;
};

export type FileModification = {
  updatedAt?: string;
};
