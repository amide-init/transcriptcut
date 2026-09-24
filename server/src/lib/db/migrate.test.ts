import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "@/lib/db/migrate";

describe("splitSqlStatements", () => {
  it("drops comments and splits on statement-ending semicolons", () => {
    expect(
      splitSqlStatements(`-- CreateTable
CREATE TABLE "A" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'none'
);

-- CreateIndex
CREATE INDEX "A_name_idx" ON "A"("name");
PRAGMA foreign_keys=ON;
`)
    ).toEqual([
      `CREATE TABLE "A" (\n    "id" TEXT NOT NULL PRIMARY KEY,\n    "name" TEXT NOT NULL DEFAULT 'none'\n)`,
      `CREATE INDEX "A_name_idx" ON "A"("name")`,
      "PRAGMA foreign_keys=ON",
    ]);
  });

  it("splits every real migration into statements that each start with a SQL keyword", () => {
    const dir = path.resolve(__dirname, "../../../prisma/migrations");
    for (const name of readdirSync(dir).filter((n) => !n.endsWith(".toml"))) {
      const statements = splitSqlStatements(readFileSync(path.join(dir, name, "migration.sql"), "utf-8"));
      expect(statements.length).toBeGreaterThan(0);
      for (const s of statements) expect(s).toMatch(/^(CREATE|ALTER|DROP|INSERT|PRAGMA)\b/);
    }
  });
});
