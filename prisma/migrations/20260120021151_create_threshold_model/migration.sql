-- CreateTable
CREATE TABLE "thresholds" (
    "id" TEXT NOT NULL,
    "late_threshold" INTEGER NOT NULL DEFAULT 30,
    "absent_threshold" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lecturer_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "thresholds_lecturer_id_key" ON "thresholds"("lecturer_id");

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "lecturers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
