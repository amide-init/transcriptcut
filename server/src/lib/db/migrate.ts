import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";

/**
 * Applies any Prisma migrations the database hasn't seen yet, at server
 * startup.
 *
 * The packaged Mac app ships a pre-migrated app.db.template and copies it
 * only on first launch (client/src-tauri/src/lib.rs), and the Prisma CLI
 * isn't in the app bundle -- so without this, an existing install never
 * gets new tables, and the updated server crashes on the first query that
 * touches one. This records each migration in Prisma's own
 * `_prisma_migrations` table, in the same format (sha256 checksum,
 * millisecond timestamps), so `prisma migrate dev/deploy` still sees an
 * accurate history in dev, where this is a no-op.
 */
export async function applyPendingMigrations(
  migrationsDir = path.resolve(process.cwd(), "prisma/migrations")
): Promise<string[]> {
  if (!existsSync(migrationsDir)) {
    logger.warn(`No migrations directory at ${migrationsDir}; skipping schema check.`);
    return [];
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`);

  const appliedRows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  );
  const applied = new Set(appliedRows.map((r) => r.migration_name));

  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const pending = entries
    .filter((e) => e.isDirectory() && !applied.has(e.name) && existsSync(path.join(migrationsDir, e.name, "migration.sql")))
    .map((e) => e.name)
    .sort();

  for (const name of pending) {
    const sql = await readFile(path.join(migrationsDir, name, "migration.sql"), "utf-8");
    const startedAt = Date.now();
    for (const statement of splitSqlStatements(sql)) {
      await prisma.$executeRawUnsafe(statement);
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
      randomUUID(),
      createHash("sha256").update(sql).digest("hex"),
      Date.now(),
      name,
      startedAt
    );
    logger.info(`Applied database migration ${name}`);
  }
  return pending;
}

/**
 * Splits a Prisma-generated migration into single statements (the driver
 * runs one at a time). Prisma's SQLite migrations are plain DDL: `--` line
 * comments and one statement per `;` at a line end, with no semicolons
 * inside literals.
 */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}
