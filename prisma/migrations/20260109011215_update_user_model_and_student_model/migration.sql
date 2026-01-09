/*
  Warnings:

  - Added the required column `studentId` to the `students` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "students" ADD COLUMN     "studentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "is_active" SET DEFAULT false,
ALTER COLUMN "emailVerificationCode" DROP NOT NULL,
ALTER COLUMN "phoneVerificationCode" DROP NOT NULL;
