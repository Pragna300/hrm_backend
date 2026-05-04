-- CreateTable
CREATE TABLE "attendance_segments" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "check_in" TIMESTAMPTZ NOT NULL,
    "check_out" TIMESTAMPTZ,
    "source" VARCHAR(20) DEFAULT 'web',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_segments_employee_id_date_idx" ON "attendance_segments"("employee_id", "date");

-- AddForeignKey
ALTER TABLE "attendance_segments" ADD CONSTRAINT "attendance_segments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
