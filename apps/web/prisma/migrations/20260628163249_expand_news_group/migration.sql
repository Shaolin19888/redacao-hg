/*
  Warnings:

  - Added the required column `updatedAt` to the `NewsGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NewsGroup" ADD COLUMN     "abordagem" TEXT,
ADD COLUMN     "confianca" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "factosConfirm" TEXT,
ADD COLUMN     "factosNaoConfirm" TEXT,
ADD COLUMN     "resumo" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
