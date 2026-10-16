-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "header" JSONB;

-- AlterTable
ALTER TABLE "PageRevision" ADD COLUMN     "header" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "settings" TEXT;
