-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "introVideoUrl" TEXT,
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "outcomes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "syllabus" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tagline" TEXT;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "introVideoPoster" TEXT,
ADD COLUMN     "introVideoUrl" TEXT,
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "sections" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tagline" TEXT;

-- CreateTable
CREATE TABLE "SiteCopy" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCopy_pkey" PRIMARY KEY ("key")
);

