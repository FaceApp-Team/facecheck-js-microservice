/*
  Warnings:

  - The values [ABSENT] on the enum `AttendanceStatus` will be removed. If these variants are still used in the database, this will fail.
  - Made the column `end_time` on table `sessions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'LATE', 'EXCUSED');
ALTER TABLE "public"."attendances" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "attendances" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
ALTER TABLE "attendances" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
COMMIT;

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "check_in_time" TIMESTAMP(3),
ADD COLUMN     "check_out_time" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "end_time" SET NOT NULL;
