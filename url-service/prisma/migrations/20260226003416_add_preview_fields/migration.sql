-- AlterTable
ALTER TABLE "URL" ADD COLUMN     "previewDescription" TEXT,
ADD COLUMN     "previewFetchedAt" TIMESTAMP(3),
ADD COLUMN     "previewImageUrl" TEXT,
ADD COLUMN     "previewTitle" TEXT;
