/*
  Warnings:

  - The values [ABSENT] on the enum `AttendanceStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `lecturerId` on the `sessions` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'LATE', 'EXCUSED');
ALTER TABLE "public"."Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attendance" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
COMMIT;

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_lecturerId_fkey";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "lecturerId";
