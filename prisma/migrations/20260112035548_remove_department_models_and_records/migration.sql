/*
  Warnings:

  - You are about to drop the column `department_id` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `departmentId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `departments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_department_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_departmentId_fkey";

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "department_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "departmentId";

-- DropTable
DROP TABLE "departments";
