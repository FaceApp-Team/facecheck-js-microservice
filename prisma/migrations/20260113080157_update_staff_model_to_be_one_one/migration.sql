/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `staffs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "staffs_user_id_key" ON "staffs"("user_id");
