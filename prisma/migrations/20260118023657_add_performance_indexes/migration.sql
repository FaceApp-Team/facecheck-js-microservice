-- AlterTable
ALTER TABLE "lecturers" ADD COLUMN     "recipient_code" TEXT;

-- AlterTable
ALTER TABLE "staffs" ADD COLUMN     "recipient_code" TEXT;

-- CreateIndex
CREATE INDEX "attendances_session_id_idx" ON "attendances"("session_id");

-- CreateIndex
CREATE INDEX "attendances_user_id_idx" ON "attendances"("user_id");

-- CreateIndex
CREATE INDEX "attendances_status_idx" ON "attendances"("status");

-- CreateIndex
CREATE INDEX "attendances_timestamp_idx" ON "attendances"("timestamp");

-- CreateIndex
CREATE INDEX "attendances_check_in_time_idx" ON "attendances"("check_in_time");

-- CreateIndex
CREATE INDEX "attendances_check_out_time_idx" ON "attendances"("check_out_time");

-- CreateIndex
CREATE INDEX "attendances_session_id_status_idx" ON "attendances"("session_id", "status");

-- CreateIndex
CREATE INDEX "attendances_user_id_timestamp_idx" ON "attendances"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "course_enrollments_course_id_idx" ON "course_enrollments"("course_id");

-- CreateIndex
CREATE INDEX "course_lecturers_lecturer_id_idx" ON "course_lecturers"("lecturer_id");

-- CreateIndex
CREATE INDEX "course_lecturers_course_id_idx" ON "course_lecturers"("course_id");

-- CreateIndex
CREATE INDEX "lecturers_user_id_idx" ON "lecturers"("user_id");

-- CreateIndex
CREATE INDEX "lecturers_staffNo_idx" ON "lecturers"("staffNo");

-- CreateIndex
CREATE INDEX "logs_user_id_idx" ON "logs"("user_id");

-- CreateIndex
CREATE INDEX "logs_created_at_idx" ON "logs"("created_at");

-- CreateIndex
CREATE INDEX "logs_status_idx" ON "logs"("status");

-- CreateIndex
CREATE INDEX "logs_priority_idx" ON "logs"("priority");

-- CreateIndex
CREATE INDEX "logs_user_id_created_at_idx" ON "logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_course_id_idx" ON "sessions"("course_id");

-- CreateIndex
CREATE INDEX "sessions_lecturer_id_idx" ON "sessions"("lecturer_id");

-- CreateIndex
CREATE INDEX "sessions_start_time_idx" ON "sessions"("start_time");

-- CreateIndex
CREATE INDEX "sessions_end_time_idx" ON "sessions"("end_time");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_course_id_status_idx" ON "sessions"("course_id", "status");

-- CreateIndex
CREATE INDEX "students_user_id_idx" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "students_student_id_idx" ON "students"("student_id");

-- CreateIndex
CREATE INDEX "users_email_phone_idx" ON "users"("email", "phone");

-- CreateIndex
CREATE INDEX "users_account_status_idx" ON "users"("account_status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at");

-- CreateIndex
CREATE INDEX "users_id_idx" ON "users"("id");
