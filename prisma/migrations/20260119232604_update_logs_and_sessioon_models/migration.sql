-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "system_logs" ADD COLUMN     "pritority" "Priority" NOT NULL DEFAULT 'MEDIUM';
