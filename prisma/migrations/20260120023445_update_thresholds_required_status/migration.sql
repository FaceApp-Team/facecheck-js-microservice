-- DropForeignKey
ALTER TABLE "thresholds" DROP CONSTRAINT "thresholds_course_rep_id_fkey";

-- AlterTable
ALTER TABLE "thresholds" ALTER COLUMN "lecturer_id" DROP NOT NULL,
ALTER COLUMN "course_rep_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_course_rep_id_fkey" FOREIGN KEY ("course_rep_id") REFERENCES "course_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
