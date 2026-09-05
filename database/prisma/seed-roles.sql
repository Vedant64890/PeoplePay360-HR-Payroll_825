-- PeoplePay360 role catalog. Run after auth.UserRole and auth.Role exist.
-- For an existing database, seed BEFORE adding User/RolePermission role foreign keys.
-- This creates role definitions only; permission grants are a separate RBAC seed.
-- Safe to rerun: existing role names/descriptions are preserved.
INSERT INTO "auth"."Role" ("code", "name", "description", "createdAt", "updatedAt")
VALUES
  ('USER', 'Legacy Employee', 'Compatibility role: grant EMPLOYEE permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MANAGER', 'Legacy HR Manager', 'Compatibility role: grant HR_MANAGER permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EMPLOYEE', 'Employee', 'Own employee details, attendance and leave access.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HR_MANAGER', 'HR Manager', 'HR administration and leave approvals without payroll access.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HR_PAYROLL_USER', 'HR Payroll User', 'HR access and payroll processing; read-only salary configuration.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HR_PAYROLL_MANAGER', 'HR Payroll Manager', 'HR and payroll administration including salary configuration.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ADMIN', 'Administrator', 'System administration including users, roles and permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
