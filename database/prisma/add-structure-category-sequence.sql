-- Add category and sequence fields to SalaryStructure for grouping and ordering.
ALTER TABLE configuration."SalaryStructure" ADD COLUMN IF NOT EXISTS "sequence" integer NOT NULL DEFAULT 10;
ALTER TABLE configuration."SalaryStructure" ADD COLUMN IF NOT EXISTS "categoryId" integer;
ALTER TABLE configuration."SalaryStructure" ADD CONSTRAINT "SalaryStructure_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES configuration."SalaryRuleCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SalaryStructure_categoryId_idx" ON configuration."SalaryStructure" ("categoryId");
