// THIS FILE IS A COPY PASTE OF DB.TS EXCEPT this first line for use in vitest tests
import "fake-indexeddb/auto";
import type { EntityTable } from "dexie";
import Dexie from "dexie";
import type {
    DbFileRow,
    DbLanguage,
    DbProject,
    FileModification,
    LanguageModification,
    ProjectModification,
} from "../types.ts";

/**
 * DB initialization and migrations using Dexie.
 *
 * - Connects to IndexedDB via Dexie for browser storage.
 * - Defines schema for languages, projects, files, and migrations.
 * - Uses Dexie's built-in versioning system for migrations.
 */

// Define the database interface
interface ScriptureEditorDB extends Dexie {
    languages: EntityTable<DbLanguage, "id">;

    projects: EntityTable<DbProject, "id">;

    files: EntityTable<DbFileRow, "pathOnDisk">;
}

/* establish connection */
const db = new Dexie("dovetail-editor") as typeof Dexie & ScriptureEditorDB;

/**
 * Initialize database schema and handle migrations using Dexie's versioning system.
 */
async function initializeDatabase() {
    try {
        // Version 1: Initial schema
        db.version(1).stores({
            languages:
                "++id, identifier, title, direction, createdAt, updatedAt",
            projects:
                "++id, projectDir, identifier, name, title, languageId, version, createdAt, importedAt, updatedAt",
            files: "++id, projectId, identifier, title, sortOrder, relativePath, pathOnDisk, fileExtension, createdAt, updatedAt",
        });

        // Add hooks for automatic timestamp management
        db.languages.hook("creating", (_primKey, obj, _trans) => {
            obj.createdAt = new Date().toISOString();
            obj.updatedAt = new Date().toISOString();
        });

        db.languages.hook(
            "updating",
            (modifications: LanguageModification, _primKey, _obj, _trans) => {
                modifications.updatedAt = new Date().toISOString();
            },
        );

        db.projects.hook("creating", (_primKey, obj, _trans) => {
            obj.createdAt = new Date().toISOString();
            obj.importedAt = new Date().toISOString();
            obj.updatedAt = new Date().toISOString();
        });

        db.projects.hook(
            "updating",
            (modifications: ProjectModification, _primKey, _obj, _trans) => {
                modifications.updatedAt = new Date().toISOString();
            },
        );

        db.files.hook("creating", (_primKey, obj, _trans) => {
            obj.createdAt = new Date().toISOString();
            obj.updatedAt = new Date().toISOString();
        });

        db.files.hook(
            "updating",
            (modifications: FileModification, _primKey, _obj, _trans) => {
                modifications.updatedAt = new Date().toISOString();
            },
        );

        // Test database connection
        // console.log("[db/init] Dexie database connected successfully");
    } catch (err) {
        console.error("[db/init] Database initialization failed:", err);
        throw err;
    }
}

/* Initialize database during module initialization */
await initializeDatabase();

export { db };
