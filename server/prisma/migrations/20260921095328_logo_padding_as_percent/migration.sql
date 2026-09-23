-- Logo padding switches from raw pixels to percent-of-frame (0-20, default
-- 3) -- see GitHub issue #21 and src/lib/video/logo.ts. Old pixel values
-- (e.g. 16) are not meaningful under the new unit, so existing rows are
-- reset to the new default rather than cast.

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
    "logoPaddingX" REAL NOT NULL DEFAULT 3,
    "logoPaddingY" REAL NOT NULL DEFAULT 3,
    "logoOpacity" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("burnInCaptions", "captionStyleJson", "createdAt", "duration", "filterId", "id", "logoOpacity", "logoPosition", "name", "propertiesJson", "updatedAt") SELECT "burnInCaptions", "captionStyleJson", "createdAt", "duration", "filterId", "id", "logoOpacity", "logoPosition", "name", "propertiesJson", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
