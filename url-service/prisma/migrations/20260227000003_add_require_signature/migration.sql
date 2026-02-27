-- Add requireSignature flag to URL model
ALTER TABLE "URL" ADD COLUMN "requireSignature" BOOLEAN NOT NULL DEFAULT false;
