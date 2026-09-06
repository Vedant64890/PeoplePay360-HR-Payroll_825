BEGIN;

CREATE TABLE IF NOT EXISTS hr."EmployeeDocument" (
  "id" SERIAL PRIMARY KEY,
  "employeeId" INTEGER NOT NULL REFERENCES hr."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" VARCHAR(150) NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "fileName" VARCHAR(180) NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeDocument_employeeId_createdAt_idx" ON hr."EmployeeDocument"("employeeId", "createdAt");

CREATE TABLE IF NOT EXISTS hr."EmployeePreferences" (
  "employeeId" INTEGER PRIMARY KEY REFERENCES hr."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "theme" VARCHAR(10) NOT NULL DEFAULT 'system',
  "timeFormat" VARCHAR(3) NOT NULL DEFAULT '12h',
  "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
  "defaultSection" VARCHAR(30) NOT NULL DEFAULT 'overview',
  "attendanceReminders" BOOLEAN NOT NULL DEFAULT true,
  "leaveUpdates" BOOLEAN NOT NULL DEFAULT true,
  "payrollUpdates" BOOLEAN NOT NULL DEFAULT true,
  "documentUpdates" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr."EmployeeNotificationRead" (
  "employeeId" INTEGER NOT NULL REFERENCES hr."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventKey" VARCHAR(180) NOT NULL,
  "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("employeeId", "eventKey")
);
COMMIT;
