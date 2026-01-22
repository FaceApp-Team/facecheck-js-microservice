/*
  Warnings:

  - A unique constraint covering the columns `[course_rep_id]` on the table `thresholds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `course_rep_id` to the `thresholds` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "thresholds" ADD COLUMN     "course_rep_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "thresholds_course_rep_id_key" ON "thresholds"("course_rep_id");

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_course_rep_id_fkey" FOREIGN KEY ("course_rep_id") REFERENCES "course_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
