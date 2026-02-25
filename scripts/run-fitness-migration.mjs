/**
 * Fitness Module Migration Runner
 *
 * Runs the fitness module SQL migrations against your Supabase Postgres database.
 *
 * Prerequisites:
 *   npm install pg        (one-time, then you can uninstall after)
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
 *     node scripts/run-fitness-migration.mjs
 *
 * Where to get DATABASE_URL:
 *   Supabase dashboard → Project Settings → Database → Connection string → URI
 *   Use the "Transaction" pooler URI (port 6543) OR the direct URI (port 5432).
 *   For migrations, prefer the direct URI (port 5432).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "\nMissing DATABASE_URL environment variable.\n\n" +
    "Get it from: Supabase dashboard → Project Settings → Database → Connection string → URI\n\n" +
    "Usage:\n" +
    '  DATABASE_URL="postgresql://postgres.[ref]:[password]@..." node scripts/run-fitness-migration.mjs\n'
  );
  process.exit(1);
}

const MIGRATIONS = [
  "20260225100000_fitness_module.sql",
  "20260225100500_seed_exercises.sql",
];

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log("Connected to database.\n");

    for (const filename of MIGRATIONS) {
      const filepath = path.join(__dirname, "..", "supabase", "migrations", filename);

      if (!fs.existsSync(filepath)) {
        console.warn(`  ⚠️  Migration file not found, skipping: ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(filepath, "utf8");
      console.log(`Running: ${filename}`);

      await client.query(sql);
      console.log(`  ✓ Done\n`);
    }

    console.log("All fitness migrations applied successfully.");
  } catch (err) {
    console.error("\nMigration failed:", err.message);
    if (err.detail) console.error("Detail:", err.detail);
    if (err.hint) console.error("Hint:", err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
