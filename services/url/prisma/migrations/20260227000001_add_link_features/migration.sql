-- AlterTable
ALTER TABLE "URL"
  ADD COLUMN "customAlias"  TEXT,
  ADD COLUMN "expiresAt"    TIMESTAMP(3),
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "tags"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "URL_customAlias_key" ON "URL"("customAlias");
