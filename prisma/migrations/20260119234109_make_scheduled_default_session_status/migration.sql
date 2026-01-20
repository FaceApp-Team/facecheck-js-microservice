/*
  Warnings:

  - You are about to drop the column `pritority` on the `system_logs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "system_logs" DROP COLUMN "pritority",
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM';
