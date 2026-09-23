-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" REAL,
    "filterId" TEXT NOT NULL DEFAULT 'none',
    "burnInCaptions" BOOLEAN NOT NULL DEFAULT false,
    "captionStyleJson" TEXT,
    "propertiesJson" TEXT,
    "logoPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "logoPaddingX" INTEGER NOT NULL DEFAULT 16,
    "logoPaddingY" INTEGER NOT NULL DEFAULT 16,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("burnInCaptions", "captionStyleJson", "createdAt", "duration", "filterId", "id", "name", "propertiesJson", "updatedAt") SELECT "burnInCaptions", "captionStyleJson", "createdAt", "duration", "filterId", "id", "name", "propertiesJson", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
