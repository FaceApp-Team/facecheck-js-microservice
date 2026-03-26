-- Add geofencing and linking fields to sessions table
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "subtopic_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "timetable_slot_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "geofence_radius" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "attendance_link" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sms_sent_to_lecturer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "week" INTEGER;

-- Add geofencing fields to attendances table
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "distance_from_session" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "within_geofence" BOOLEAN NOT NULL DEFAULT true;

-- Unique index on attendance_link
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_attendance_link_key" ON "sessions"("attendance_link");

-- Indexes for new session columns
CREATE INDEX IF NOT EXISTS "sessions_subtopic_id_idx" ON "sessions"("subtopic_id");
CREATE INDEX IF NOT EXISTS "sessions_timetable_slot_id_idx" ON "sessions"("timetable_slot_id");

-- Foreign keys for sessions -> subtopics and timetable_slots
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_subtopic_id_fkey') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_subtopic_id_fkey"
      FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_timetable_slot_id_fkey') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_timetable_slot_id_fkey"
      FOREIGN KEY ("timetable_slot_id") REFERENCES "timetable_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
