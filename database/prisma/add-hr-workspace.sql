-- HR contracts can be prepared before payroll configuration is assigned.
ALTER TABLE hr."Contract" ALTER COLUMN "salaryStructureId" DROP NOT NULL;
-- Retain correction history when a mistaken attendance session is removed.
ALTER TABLE attendance."Attendance" ADD COLUMN IF NOT EXISTS "voidedAt" timestamptz(3);
DROP INDEX IF EXISTS attendance."Attendance_attendanceDayId_checkIn_key";
CREATE INDEX IF NOT EXISTS "Attendance_attendanceDayId_checkIn_idx" ON attendance."Attendance" ("attendanceDayId", "checkIn");
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_active_day_checkIn_key" ON attendance."Attendance" ("attendanceDayId", "checkIn") WHERE "voidedAt" IS NULL;
