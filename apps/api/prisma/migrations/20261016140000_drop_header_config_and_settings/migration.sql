/*
  Warnings:

  - You are about to drop the column `headerConfig` on the `Page` table. All the data in the column will be lost.
  - You are about to drop the column `headerConfig` on the `PageRevision` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Page" DROP COLUMN "headerConfig";

-- AlterTable
ALTER TABLE "PageRevision" DROP COLUMN "headerConfig";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "settings";
