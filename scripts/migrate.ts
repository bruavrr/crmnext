import { pool, transaction } from "../src/lib/db";
import { readFile, readdir } from "node:fs/promises";
await transaction(async (c) => {
  await c.query("SELECT pg_advisory_xact_lock(901)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !(await c.query("SELECT 1 FROM migrations WHERE name=$1", [file]))
        .rowCount
    ) {
      await c.query(await readFile(`migrations/${file}`, "utf8"));
      await c.query("INSERT INTO migrations(name) VALUES($1)", [file]);
      console.log(`Applied ${file}`);
    }
  }
});
await pool.end();
