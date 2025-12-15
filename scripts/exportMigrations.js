import fs from "node:fs/promises";

import {readMigrationFiles} from "drizzle-orm/migrator";

import {migrationsFolder} from "../src/app/db/drizzle.config.ts";

const file = "../src/app/db/migrations.json";

await fs.writeFile(
  `${file}`,
  JSON.stringify(
    readMigrationFiles({
      migrationsFolder,
    }),
    null,
    0
  ),
  {
    flag: "w",
  }
);
