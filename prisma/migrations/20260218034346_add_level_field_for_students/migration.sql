/*
  Warnings:

  - You are about to drop the `module_enrollments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "module_enrollments" DROP CONSTRAINT "module_enrollments_module_id_fkey";

-- DropForeignKey
ALTER TABLE "module_enrollments" DROP CONSTRAINT "module_enrollments_student_id_fkey";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 100;

-- DropTable
DROP TABLE "module_enrollments";
