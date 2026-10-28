-- AlterTable
ALTER TABLE "UserGrant" ADD COLUMN     "requests" BOOLEAN;

-- CreateTable
CREATE TABLE "ProjectLmsGroup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ProjectLmsGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLmsRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "pageIds" TEXT[],
    "requests" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectLmsRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectLmsGroup_groupId_idx" ON "ProjectLmsGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLmsGroup_projectId_groupId_key" ON "ProjectLmsGroup"("projectId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLmsRole_projectId_role_key" ON "ProjectLmsRole"("projectId", "role");

-- AddForeignKey
ALTER TABLE "ProjectLmsGroup" ADD CONSTRAINT "ProjectLmsGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLmsRole" ADD CONSTRAINT "ProjectLmsRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
