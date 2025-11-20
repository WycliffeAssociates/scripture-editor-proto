// (code below)
import { db } from "./connect.ts";

export async function resetDb(dropOnly = false) {
  console.log("Reset: dropping view and tables...");
  try {
    // Drop dependent objects first
    await db.exec("DROP VIEW IF EXISTS projects_by_language;");
    await db.exec("DROP TABLE IF EXISTS files;");
    await db.exec("DROP TABLE IF EXISTS projects;");
    await db.exec("DROP TABLE IF EXISTS languages;");
    await db.exec("DROP TABLE IF EXISTS migrations;");
    console.log("Reset: dropped view + tables.");
    if (!dropOnly) {
      // If you want to immediately re-run migrations, import/run the migration runner.
      // If your connect module already runs migrations on import, you may need to reload the page.
      console.log(
        "Reset: you can now reload the app so migration runner recreates schema.",
      );
    }
  } catch (err) {
    console.error("Reset failed:", err);
    throw err;
  }
}
