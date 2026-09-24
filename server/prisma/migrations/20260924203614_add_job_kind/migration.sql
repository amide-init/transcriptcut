-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TranscriptionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'transcribe',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscriptionJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TranscriptionJob" ("completedChunks", "createdAt", "error", "id", "projectId", "status", "totalChunks", "updatedAt") SELECT "completedChunks", "createdAt", "error", "id", "projectId", "status", "totalChunks", "updatedAt" FROM "TranscriptionJob";
DROP TABLE "TranscriptionJob";
ALTER TABLE "new_TranscriptionJob" RENAME TO "TranscriptionJob";
CREATE INDEX "TranscriptionJob_projectId_idx" ON "TranscriptionJob"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
