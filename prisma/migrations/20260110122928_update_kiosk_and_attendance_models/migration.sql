/*
  Warnings:

  - You are about to drop the column `emailVerificationCode` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerificationRetries` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `loginRetries` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phoneVerificationCode` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phoneVerificationRetries` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `Attendance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Kiosk` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_session_id_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_user_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "emailVerificationCode",
DROP COLUMN "emailVerificationRetries",
DROP COLUMN "loginRetries",
DROP COLUMN "phoneVerificationCode",
DROP COLUMN "phoneVerificationRetries",
ADD COLUMN     "email_verification_code" TEXT,
ADD COLUMN     "email_verification_retries" INTEGER DEFAULT 0,
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "login_retries" INTEGER DEFAULT 0,
ADD COLUMN     "phone_verification_code" TEXT,
ADD COLUMN     "phone_verification_retries" INTEGER DEFAULT 0,
ADD COLUMN     "verification_code_attempts" INTEGER DEFAULT 0;

-- DropTable
DROP TABLE "Attendance";

-- DropTable
DROP TABLE "Kiosk";

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "source" TEXT,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "kiosks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendances_session_id_user_id_key" ON "attendances"("session_id", "user_id");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
