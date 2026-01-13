/*
  Warnings:

  - The values [CHECK_IN,CHECK_OUT] on the enum `SessionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- AlterEnum
BEGIN;
CREATE TYPE "SessionType_new" AS ENUM ('CLASS', 'EXAM', 'LAB', 'TUTORIAL', 'EVENT', 'WORKSHIFT');
ALTER TABLE "sessions" ALTER COLUMN "type" TYPE "SessionType_new" USING ("type"::text::"SessionType_new");
ALTER TYPE "SessionType" RENAME TO "SessionType_old";
ALTER TYPE "SessionType_new" RENAME TO "SessionType";
DROP TYPE "public"."SessionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "absent_threshold" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "late_threshold" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "mode" "SessionMode" NOT NULL DEFAULT 'CHECK_IN',
ALTER COLUMN "type" SET DEFAULT 'CLASS';
