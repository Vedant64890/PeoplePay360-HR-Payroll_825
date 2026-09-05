ALTER TABLE auth."User" ADD COLUMN IF NOT EXISTS "sessionVersion" integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth."PasswordReset" (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES auth."User"(id) ON DELETE CASCADE,
  "tokenHash" char(64) NOT NULL UNIQUE,
  "expiresAt" timestamptz(3) NOT NULL,
  "usedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_expiresAt_idx" ON auth."PasswordReset" ("userId", "expiresAt");
