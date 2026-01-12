-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "last_login_ip" TEXT,
ADD COLUMN     "password_reset_code" TEXT,
ADD COLUMN     "reset_code_created_at" TIMESTAMP(3);
