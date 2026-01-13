/*
  Warnings:

  - You are about to drop the column `studentId` on the `students` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[student_id]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `student_id` to the `students` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "students" DROP COLUMN "studentId",
ADD COLUMN     "student_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "students_student_id_key" ON "students"("student_id");
