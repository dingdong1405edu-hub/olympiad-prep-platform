-- Thi thử + chấm điểm bằng AI (AI_GRADING_SPEC.md §4)

-- CreateEnum
CREATE TYPE "MockPart" AS ENUM ('MCQ', 'SHORT', 'ESSAY');

-- CreateEnum
CREATE TYPE "MockGradingMode" AS ENUM ('EXACT', 'NUMERIC', 'EXPRESSION', 'GRID', 'ESSAY');

-- CreateEnum
CREATE TYPE "MockAttemptStatus" AS ENUM ('GRADING', 'DONE', 'PARTIAL_FAILED');

-- CreateEnum
CREATE TYPE "MockAnswerStatus" AS ENUM ('PENDING', 'GRADED', 'FAILED');

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "gradeLevel" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 180,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamQuestion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "part" "MockPart" NOT NULL,
    "gradingMode" "MockGradingMode" NOT NULL,
    "maxPoints" DOUBLE PRECISION NOT NULL,
    "promptMd" TEXT NOT NULL,
    "imageUrl" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answerKey" JSONB NOT NULL,
    "solutionMd" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MockExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamRubric" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MockExamRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamAttempt" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "MockAttemptStatus" NOT NULL DEFAULT 'GRADING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION,
    "totalPoints" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MockExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerJson" JSONB,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transcriptMd" TEXT,
    "status" "MockAnswerStatus" NOT NULL DEFAULT 'PENDING',
    "maxPoints" DOUBLE PRECISION NOT NULL,
    "awarded" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "feedbackVi" TEXT,
    "criteriaJson" JSONB NOT NULL DEFAULT '[]',
    "gradeDetail" JSONB,
    "errorMsg" TEXT,
    "gradedAt" TIMESTAMP(3),
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),

    CONSTRAINT "MockExamAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamUpload" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockExamUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MockExam_slug_key" ON "MockExam"("slug");

-- CreateIndex
CREATE INDEX "MockExam_isPublished_createdAt_idx" ON "MockExam"("isPublished", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamQuestion_examId_number_key" ON "MockExamQuestion"("examId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamRubric_questionId_code_key" ON "MockExamRubric"("questionId", "code");

-- CreateIndex
CREATE INDEX "MockExamAttempt_userId_submittedAt_idx" ON "MockExamAttempt"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "MockExamAttempt_examId_submittedAt_idx" ON "MockExamAttempt"("examId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamAnswer_attemptId_questionId_key" ON "MockExamAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "MockExamAnswer_attemptId_idx" ON "MockExamAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "MockExamAnswer_status_needsReview_idx" ON "MockExamAnswer"("status", "needsReview");

-- CreateIndex
CREATE INDEX "MockExamUpload_createdAt_idx" ON "MockExamUpload"("createdAt");

-- AddForeignKey
ALTER TABLE "MockExamQuestion" ADD CONSTRAINT "MockExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "MockExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamRubric" ADD CONSTRAINT "MockExamRubric_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MockExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamAttempt" ADD CONSTRAINT "MockExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "MockExam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamAnswer" ADD CONSTRAINT "MockExamAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "MockExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamAnswer" ADD CONSTRAINT "MockExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MockExamQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
