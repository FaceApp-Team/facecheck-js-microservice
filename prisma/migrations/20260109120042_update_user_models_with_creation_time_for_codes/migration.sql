-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerificationRetries" INTEGER,
ADD COLUMN     "email_code_created_at" TIMESTAMP(3),
ADD COLUMN     "phoneVerificationRetries" INTEGER,
ADD COLUMN     "phone_code_created_at" TIMESTAMP(3);
