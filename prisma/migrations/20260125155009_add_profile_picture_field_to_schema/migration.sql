-- DropForeignKey
ALTER TABLE "thresholds" DROP CONSTRAINT "thresholds_course_rep_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profile_picture" TEXT;

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_course_rep_id_fkey" FOREIGN KEY ("course_rep_id") REFERENCES "course_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
