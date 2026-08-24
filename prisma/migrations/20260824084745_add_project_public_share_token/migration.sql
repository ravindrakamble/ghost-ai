-- AlterTable
ALTER TABLE "Project" ADD COLUMN "publicShareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_publicShareToken_key" ON "Project"("publicShareToken");
