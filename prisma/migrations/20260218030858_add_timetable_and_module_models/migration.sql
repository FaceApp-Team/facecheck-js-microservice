/*
  Warnings:

  - You are about to drop the column `course_rep_id` on the `thresholds` table. All the data in the column will be lost.
  - You are about to drop the `course_reps` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[student_rep_id]` on the table `thresholds` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LECTURE', 'PBL', 'SDL', 'TUTORIAL', 'PRACTICAL', 'CLIN_SKILLS', 'ANATOMY_PRACTICAL', 'BIOCHEMISTRY_PRACTICAL', 'SPORTS', 'COMMUNITY_VISIT', 'EXAM', 'OTHER');

-- DropForeignKey
ALTER TABLE "course_reps" DROP CONSTRAINT "course_reps_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_reps" DROP CONSTRAINT "course_reps_student_id_fkey";

-- DropForeignKey
ALTER TABLE "thresholds" DROP CONSTRAINT "thresholds_course_rep_id_fkey";

-- DropIndex
DROP INDEX "thresholds_course_rep_id_key";

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "module_id" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "module_id" TEXT;

-- AlterTable
ALTER TABLE "thresholds" DROP COLUMN "course_rep_id",
ADD COLUMN     "student_rep_id" TEXT;

-- DropTable
DROP TABLE "course_reps";

-- CreateTable
CREATE TABLE "subtopics" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lecturer_id" TEXT,
    "lecturer_name" TEXT,
    "weeks" INTEGER NOT NULL DEFAULT 1,
    "hours_per_week" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "total_weeks" INTEGER NOT NULL DEFAULT 4,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "timetable_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "subtopic_id" TEXT,
    "day" "DayOfWeek" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "activity_type" "ActivityType" NOT NULL DEFAULT 'LECTURE',
    "lecturer_id" TEXT,
    "lecturer_name" TEXT,
    "venue" TEXT,
    "week" INTEGER NOT NULL DEFAULT 1,
    "col_span" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_reps" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 3,
    "level" INTEGER NOT NULL DEFAULT 100,
    "semester" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER DEFAULT 12,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subtopics_module_id_order_idx" ON "subtopics"("module_id", "order");

-- CreateIndex
CREATE INDEX "subtopics_lecturer_id_idx" ON "subtopics"("lecturer_id");

-- CreateIndex
CREATE INDEX "timetables_module_id_idx" ON "timetables"("module_id");

-- CreateIndex
CREATE INDEX "timetables_level_semester_academic_year_idx" ON "timetables"("level", "semester", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "timetables_module_id_academic_year_key" ON "timetables"("module_id", "academic_year");

-- CreateIndex
CREATE INDEX "timetable_slots_timetable_id_week_idx" ON "timetable_slots"("timetable_id", "week");

-- CreateIndex
CREATE INDEX "timetable_slots_timetable_id_week_day_start_time_idx" ON "timetable_slots"("timetable_id", "week", "day", "start_time");

-- CreateIndex
CREATE INDEX "timetable_slots_subtopic_id_idx" ON "timetable_slots"("subtopic_id");

-- CreateIndex
CREATE INDEX "timetable_slots_lecturer_id_idx" ON "timetable_slots"("lecturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_reps_student_id_key" ON "student_reps"("student_id");

-- CreateIndex
CREATE INDEX "student_reps_student_id_idx" ON "student_reps"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "modules_code_idx" ON "modules"("code");

-- CreateIndex
CREATE INDEX "modules_level_semester_order_idx" ON "modules"("level", "semester", "order");

-- CreateIndex
CREATE INDEX "module_enrollments_student_id_idx" ON "module_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "module_enrollments_module_id_idx" ON "module_enrollments"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_enrollments_student_id_module_id_key" ON "module_enrollments"("student_id", "module_id");

-- CreateIndex
CREATE INDEX "courses_module_id_idx" ON "courses"("module_id");

-- CreateIndex
CREATE INDEX "sessions_module_id_idx" ON "sessions"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "thresholds_student_rep_id_key" ON "thresholds"("student_rep_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_reps" ADD CONSTRAINT "student_reps_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_student_rep_id_fkey" FOREIGN KEY ("student_rep_id") REFERENCES "student_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
