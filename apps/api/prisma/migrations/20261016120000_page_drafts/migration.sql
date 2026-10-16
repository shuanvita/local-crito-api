-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "draft" JSONB,
ADD COLUMN     "draftById" TEXT,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_draftById_fkey" FOREIGN KEY ("draftById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
