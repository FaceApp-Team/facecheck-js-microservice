-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "image_status" "ImageStatus" DEFAULT 'PENDING';
