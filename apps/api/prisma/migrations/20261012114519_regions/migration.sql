-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Region_projectId_sortOrder_idx" ON "Region"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Region_projectId_value_key" ON "Region"("projectId", "value");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
