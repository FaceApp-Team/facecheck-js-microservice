-- AlterEnum
ALTER TYPE "Priority" ADD VALUE 'CRITICAL';

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
