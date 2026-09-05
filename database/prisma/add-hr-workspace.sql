-- HR contracts can be prepared before payroll configuration is assigned.
ALTER TABLE hr."Contract" ALTER COLUMN "salaryStructureId" DROP NOT NULL;
-- Retain correction history when a mistaken attendance session is removed.
ALTER TABLE attendance."Attendance" ADD COLUMN IF NOT EXISTS "voidedAt" timestamptz(3);
