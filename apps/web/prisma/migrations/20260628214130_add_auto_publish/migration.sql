-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT false;
