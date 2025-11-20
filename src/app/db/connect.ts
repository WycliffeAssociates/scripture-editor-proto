import { connect } from "@tursodatabase/database-wasm/vite";

/**
 * DB initialization and migrations runner.
 *
 * - Connects to the local Turso-compatible sqlite-like database.
 * - Loads SQL migration files using Vite's `import.meta.glob` (raw text).
 * - Executes each migration file in filename order.
 * - Records applied migrations in a small `migrations` table via `INSERT OR IGNORE`.
 *
 * Notes:
 * - Migration SQL files should be placed alongside this file under `./migrations/*.sql`.
 * - Migration files should be written to be idempotent (e.g., use `CREATE TABLE IF NOT EXISTS`)
 *   so it's safe to execute them repeatedly during development.
 */

/* establish connection */
const db = await connect("dovetail.db", {
  timeout: 1000,
});

/* load migration files via Vite's glob as raw text (eager -> already resolved strings) */
const migrationModules = import.meta.glob("./migrations/*.sql", {
  as: "raw",
  eager: true,
}) as Record<string, string | (() => Promise<string>)>;

/**
 * Normalize the migration modules into an array of { name, sql } sorted by filename.
 */
function collectMigrations(
  mods: Record<string, string | (() => Promise<string>)>,
) {
  const entries: Array<{ path: string; name: string; sql: string }> = [];

  for (const [path, value] of Object.entries(mods)) {
    let sql: string;
    if (typeof value === "string") {
      sql = value;
    } else {
      // In case an environment returns a loader function (non-eager), we'll fall back to calling it.
      // Note: with `eager: true` above this branch should not be used, but keep for resilience.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      sql = "";
      /* placeholder; real invocation will be awaited below if needed */
    }
    const name = path.split("/").pop() ?? path;
    entries.push({ path, name, sql });
  }

  // Sort by filename (lexicographic) so '0001_*' comes before '0002_*'
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}

/**
 * Run migrations: ensure `migrations` table exists, then execute each SQL file and record it.
 */
async function runMigrations() {
  try {
    // Ensure foreign keys are enabled
    try {
      await db.exec("PRAGMA foreign_keys = ON;");
    } catch (e) {
      console.warn("[db/init] PRAGMA foreign_keys failed:", e);
    }

    // Ensure migrations tracking table exists
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrations = collectMigrations(migrationModules);

    for (const m of migrations) {
      let sqlToExec = m.sql;

      // If the sql string wasn't eagerly loaded for some reason, attempt to load dynamically.
      if (!sqlToExec || sqlToExec.length === 0) {
        const maybeLoader = (migrationModules as any)[m.path];
        if (typeof maybeLoader === "function") {
          try {
            sqlToExec = await maybeLoader();
          } catch (e) {
            console.error(
              `[db/init] failed to load migration file ${m.name}:`,
              e,
            );
            continue;
          }
        } else {
          console.warn(
            `[db/init] migration ${m.name} has no SQL content; skipping`,
          );
          continue;
        }
      }

      console.log(`[db/init] Applying migration: ${m.name}`);
      try {
        // Execute SQL content. Migration files should be idempotent when possible.
        await db.exec(sqlToExec);

        // Record applied migration (idempotent via INSERT OR IGNORE)
        const insertSql = `INSERT OR IGNORE INTO migrations (name) VALUES ('${m.name}');`;
        await db.exec(insertSql);
        console.log(`[db/init] Migration applied: ${m.name}`);
      } catch (e) {
        console.error(`[db/init] Error applying migration ${m.name}:`, e);
        // Don't throw here so we attempt to run remaining migrations.
      }
    }

    // Optional: quick sanity check
    try {
      const test = await db.exec("SELECT 1;");
      console.log(
        "[db/init] DB connected and migrations run. Sanity check:",
        test,
      );
    } catch (e) {
      console.warn("[db/init] Sanity check SELECT 1 failed:", e);
    }
  } catch (err) {
    console.error("[db/init] Migration runner failed:", err);
    throw err;
  }
}

/* Run migrations during module initialization */
await runMigrations();

export { db };
