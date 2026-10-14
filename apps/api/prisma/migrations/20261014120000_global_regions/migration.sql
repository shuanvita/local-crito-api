-- Справочник регионов становится общим для всех проектов.
-- Если у разных проектов был один и тот же идентификатор, остаётся самая ранняя запись.
DELETE FROM "Region" AS r
USING "Region" AS keep
WHERE r."value" = keep."value"
  AND (r."createdAt", r."id") > (keep."createdAt", keep."id");

-- DropForeignKey
ALTER TABLE "Region" DROP CONSTRAINT "Region_projectId_fkey";

-- DropIndex
DROP INDEX "Region_projectId_sortOrder_idx";

-- DropIndex
DROP INDEX "Region_projectId_value_key";

-- AlterTable
ALTER TABLE "Region" DROP COLUMN "projectId";

-- CreateIndex
CREATE UNIQUE INDEX "Region_value_key" ON "Region"("value");

-- CreateIndex
CREATE INDEX "Region_sortOrder_idx" ON "Region"("sortOrder");
