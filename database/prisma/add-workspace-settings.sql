-- Additive migration for databases already using the six-schema HR model.
CREATE TABLE IF NOT EXISTS configuration."WorkspaceSettings" (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "organizationName" VARCHAR(150) NOT NULL DEFAULT 'Your organization',
  "supportEmail" VARCHAR(254),
  "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'INR',
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  "reportMonths" INTEGER NOT NULL DEFAULT 6 CHECK ("reportMonths" IN (3, 6, 12)),
  version INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
