-- CreateTable
CREATE TABLE "URL" (
    "id" SERIAL NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "URL_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "URL_shortId_key" ON "URL"("shortId");
