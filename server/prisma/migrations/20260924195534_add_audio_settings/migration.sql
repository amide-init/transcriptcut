-- AlterTable
ALTER TABLE "Project" ADD COLUMN "audioSettingsJson" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RenderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'export',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "outputPath" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RenderJob" ("createdAt", "error", "id", "outputPath", "projectId", "status", "updatedAt") SELECT "createdAt", "error", "id", "outputPath", "projectId", "status", "updatedAt" FROM "RenderJob";
DROP TABLE "RenderJob";
ALTER TABLE "new_RenderJob" RENAME TO "RenderJob";
CREATE INDEX "RenderJob_projectId_idx" ON "RenderJob"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
