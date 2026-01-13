-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "logs" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'HIGH';
