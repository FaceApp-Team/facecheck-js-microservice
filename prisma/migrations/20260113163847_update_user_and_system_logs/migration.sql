-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('READ', 'UNREAD');

-- AlterTable
ALTER TABLE "logs" ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD';

-- AlterTable
ALTER TABLE "system_logs" ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD';
