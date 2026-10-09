-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Page_projectId_deletedAt_idx" ON "Page"("projectId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
