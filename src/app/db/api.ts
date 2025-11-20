/**
 * DB API helpers using prepared statements (db.prepare) for Turso-like Database.
 *
 * This module implements CRUD helpers for `languages`, `projects`, `files`
 * and minimal migration tracking.
 */

import { db } from "./connect.ts";

// -- Types --

export type Language = {
  id: number;
  identifier: string;
  title: string | null;
  direction: "ltr" | "rtl" | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Project = {
  id: number;
  identifier: string | null;
  name: string | null;
  project_dir: string;
  title: string | null;
  language_id: number | null;
  version: string | null;
  created_at: string | null;
  imported_at: string | null;
  updated_at: string | null;
};

export type FileRow = {
  id: number;
  project_id: number;
  identifier: string | null;
  title: string | null;
  sort_order: number | null;
  relative_path: string | null;
  path_on_disk: string;
  file_extension: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Standard definition for SQL parameters (named or positional)
type SqlParams =
  | Record<string, string | number | null | undefined>
  | (string | number | null | undefined)[];

// Standard definition of a run result (changes, lastId)
type RunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

/* ---------------------------
   Generic Helpers
   --------------------------- */

async function all<T>(sql: string, params?: SqlParams): Promise<T[]> {
  const stmt = db.prepare(sql);
  try {
    const res = await (params ? stmt.all(params) : stmt.all());

    if (Array.isArray(res)) {
      return res as T[];
    }

    // Handle { rows: [...] } wrapper if present
    if (
      res &&
      typeof res === "object" &&
      "rows" in res &&
      Array.isArray((res as any).rows)
    ) {
      return (res as any).rows as T[];
    }

    return [] as T[];
  } finally {
    // Safely attempt to close/finalize based on what method exists
    try {
      if (typeof (stmt as any).close === "function") {
        (stmt as any).close();
      } else if (typeof (stmt as any).finalize === "function") {
        await (stmt as any).finalize();
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

async function get<T>(sql: string, params?: SqlParams): Promise<T | null> {
  const stmt = db.prepare(sql);
  try {
    const res = await (params ? stmt.get(params) : stmt.get());

    if (!res) return null;

    if (typeof res === "object" && "row" in res) {
      return (res as any).row as T;
    }

    return res as T;
  } finally {
    try {
      if (typeof (stmt as any).close === "function") {
        (stmt as any).close();
      } else if (typeof (stmt as any).finalize === "function") {
        await (stmt as any).finalize();
      }
    } catch {
      // ignore
    }
  }
}

async function run(sql: string, params?: SqlParams): Promise<RunResult> {
  const stmt = db.prepare(sql);
  try {
    const res = await (params ? stmt.run(params) : stmt.run());
    return res as unknown as RunResult;
  } finally {
    try {
      if (typeof (stmt as any).close === "function") {
        (stmt as any).close();
      } else if (typeof (stmt as any).finalize === "function") {
        await (stmt as any).finalize();
      }
    } catch {
      // ignore
    }
  }
}

/* ---------------------------
   Languages CRUD
   --------------------------- */

export async function getLanguageByIdentifier(
  identifier: string,
): Promise<Language | null> {
  return await get<Language>(
    `SELECT * FROM languages WHERE identifier = :identifier LIMIT 1;`,
    { identifier: identifier }, // Removed colon
  );
}

export async function upsertLanguage(
  identifier: string,
  title: string | null = null,
  direction: "ltr" | "rtl" | null = "ltr",
): Promise<Language | null> {
  const sql = `
    INSERT INTO languages (identifier, title, direction)
    VALUES (:identifier, :title, :direction)
    ON CONFLICT(identifier) DO UPDATE SET
      title = excluded.title,
      direction = excluded.direction,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await run(sql, {
    identifier: identifier, // Removed colon
    title: title, // Removed colon
    direction: direction, // Removed colon
  });

  return await getLanguageByIdentifier(identifier);
}

export async function listLanguages(): Promise<Language[]> {
  return await all<Language>(`SELECT * FROM languages ORDER BY identifier;`);
}

/* ---------------------------
   Projects CRUD
   --------------------------- */

export async function getProjectByDir(
  projectDir: string,
): Promise<Project | null> {
  return await get<Project>(
    `SELECT * FROM projects WHERE project_dir = :project_dir LIMIT 1;`,
    { project_dir: projectDir }, // Removed colon
  );
}

export async function upsertProject(
  projectDir: string,
  opts: {
    identifier?: string | null;
    name?: string | null;
    title?: string | null;
    language_id?: number | null;
    version?: string | null;
  } = {},
): Promise<Project | null> {
  const sql = `
    INSERT INTO projects (project_dir, identifier, name, title, language_id, version)
    VALUES (:project_dir, :identifier, :name, :title, :language_id, :version)
    ON CONFLICT(project_dir) DO UPDATE SET
      identifier = excluded.identifier,
      name = excluded.name,
      title = excluded.title,
      language_id = excluded.language_id,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await run(sql, {
    project_dir: projectDir, // Removed colon
    identifier: opts.identifier ?? null,
    name: opts.name ?? null,
    title: opts.title ?? null,
    language_id: opts.language_id ?? null,
    version: opts.version ?? null,
  });

  return await getProjectByDir(projectDir);
}

export async function listProjects(): Promise<Project[]> {
  return await all<Project>(
    `SELECT * FROM projects ORDER BY imported_at DESC;`,
  );
}

export async function listProjectsByLanguage(): Promise<unknown[]> {
  return await all<unknown>(`SELECT * FROM projects_by_language;`);
}

export async function deleteProjectById(id: number): Promise<RunResult> {
  try {
    // Begin a transaction so deletions are atomic.
    await run(`BEGIN`);

    // Delete dependent files first
    await run(`DELETE FROM files WHERE project_id = :id;`, { id: id }); // Removed colon

    // Delete the project row
    const res = await run(`DELETE FROM projects WHERE id = :id;`, {
      id: id, // Removed colon
    });

    // Commit the transaction.
    await run(`COMMIT`);

    return res;
  } catch (e) {
    try {
      await run(`ROLLBACK`);
    } catch (rbErr) {
      console.warn("[db/api] rollback failed during deleteProjectById:", rbErr);
    }
    throw e;
  }
}

/* ---------------------------
   Files CRUD
   --------------------------- */

export async function getFileByPath(
  pathOnDisk: string,
): Promise<FileRow | null> {
  return await get<FileRow>(
    `SELECT * FROM files WHERE path_on_disk = :path_on_disk LIMIT 1;`,
    { path_on_disk: pathOnDisk }, // Removed colon
  );
}

export async function upsertFile(
  projectId: number,
  file: {
    identifier?: string | null;
    title?: string | null;
    sort_order?: number | null;
    relative_path?: string | null;
    path_on_disk: string;
    file_extension?: string | null;
  },
): Promise<FileRow | null> {
  const sql = `
    INSERT INTO files (project_id, identifier, title, sort_order, relative_path, path_on_disk, file_extension)
    VALUES (:project_id, :identifier, :title, :sort_order, :relative_path, :path_on_disk, :file_extension)
    ON CONFLICT(path_on_disk) DO UPDATE SET
      project_id = excluded.project_id,
      identifier = excluded.identifier,
      title = excluded.title,
      sort_order = excluded.sort_order,
      relative_path = excluded.relative_path,
      file_extension = excluded.file_extension,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await run(sql, {
    project_id: projectId, // Removed colon (applied to all below)
    identifier: file.identifier ?? null,
    title: file.title ?? null,
    sort_order: file.sort_order ?? null,
    relative_path: file.relative_path ?? null,
    path_on_disk: file.path_on_disk,
    file_extension: file.file_extension ?? null,
  });

  return await getFileByPath(file.path_on_disk);
}

export async function listFilesForProject(
  projectId: number,
): Promise<FileRow[]> {
  const sql = `SELECT * FROM files WHERE project_id = :project_id ORDER BY COALESCE(sort_order, 2147483647), id;`;
  return await all<FileRow>(sql, { project_id: projectId }); // Removed colon
}

export async function deleteFileById(id: number): Promise<RunResult> {
  return await run(`DELETE FROM files WHERE id = :id;`, { id: id }); // Removed colon
}

/* ---------------------------
   Migrations helpers
   --------------------------- */

export async function getAppliedMigrations(): Promise<string[]> {
  const rows = await all<{ name: string }>(
    `SELECT name FROM migrations ORDER BY applied_at;`,
  );
  return rows.map((r) => r.name);
}

export async function recordMigration(name: string): Promise<RunResult> {
  return await run(`INSERT OR IGNORE INTO migrations (name) VALUES (:name);`, {
    name: name, // Removed colon
  });
}

/* ---------------------------
   Convenience composites
   --------------------------- */

export type ProjectComposite = {
  project: Project;
  files: FileRow[];
  language: Language | null;
};

export async function getProjectWithFilesByDir(
  projectDir: string,
): Promise<ProjectComposite | null> {
  const project = await getProjectByDir(projectDir);
  if (!project) return null;

  const files = await listFilesForProject(project.id);

  let language: Language | null = null;
  if (project.language_id) {
    language = await get<Language>(
      `SELECT * FROM languages WHERE id = :id LIMIT 1;`,
      {
        id: project.language_id, // Removed colon
      },
    );
  }

  return { project, files, language };
}
