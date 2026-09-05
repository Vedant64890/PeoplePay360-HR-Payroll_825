// One-time cleanup for the inspected Odoo_hackathon installation.
// Run: node database/prisma/remove-public-schema.mjs --apply (from app/).
// Refuses other databases, unexpected legacy objects, populated legacy HR/payroll
// tables, or a nonempty destination User table. Preserves users before removal.
// All changes are transactional; RESTRICT prevents deletion of external dependencies.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const { Client } = require("pg");
require("dotenv").config({ path: fileURLToPath(new URL("../../backend/.env", import.meta.url)), quiet: true });

if (!process.argv.includes("--apply")) {
  throw new Error("Use --apply to run this guarded database cleanup.");
}

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([^}]*?)^}/gm)].map(([, name, body]) => ({
  legacyName: name,
  name: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name,
  schema: body.match(/@@schema\("([^"]+)"\)/)?.[1],
}));
const enumNames = [...schema.matchAll(/^enum (\w+) \{/gm)].map(([, name]) => name);
const expectedLegacyNames = new Set(models.filter((model) => model.legacyName !== "Role").map((model) => model.legacyName));
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  const database = (await client.query("SELECT current_database() AS name")).rows[0].name;
  if (database !== "Odoo_hackathon") throw new Error("Cleanup is restricted to Odoo_hackathon.");

  const publicExists = (await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'public'")).rowCount > 0;
  if (!publicExists) {
    await client.query("ROLLBACK");
    console.log("public is already absent; no cleanup needed.");
  } else {
    const legacyTables = (await client.query(`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname
    `)).rows.map((row) => row.name);
    if (legacyTables.length !== expectedLegacyNames.size || legacyTables.some((name) => !expectedLegacyNames.has(name))) {
      throw new Error("Legacy tables differ from the inspected 43-table installation; migration review required.");
    }
    for (const model of models) {
      if (!model.schema) throw new Error("A target model has no schema mapping.");
      const exists = await client.query("SELECT to_regclass($1) AS relation", [`${quote(model.schema)}.${quote(model.name)}`]);
      if (!exists.rows[0].relation) throw new Error(`Missing destination ${model.schema}.${model.name}.`);
    }

    // Prevent records from changing between emptiness checks, copying, and cleanup.
    await client.query(`LOCK TABLE ${legacyTables.map((name) => `"public".${quote(name)}`).join(", ")}, "auth"."User", "auth"."Role" IN ACCESS EXCLUSIVE MODE`);
    for (const name of legacyTables.filter((name) => name !== "User")) {
      const hasRows = (await client.query(`SELECT EXISTS (SELECT 1 FROM "public".${quote(name)}) AS present`)).rows[0].present;
      if (hasRows) throw new Error(`public.${name} contains data; a data migration is required.`);
    }
    if ((await client.query('SELECT EXISTS (SELECT 1 FROM "auth"."User") AS present')).rows[0].present) {
      throw new Error("auth.User already contains records; review user conflicts before cleanup.");
    }

    const legacyEnums = (await client.query(`
      SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY t.typname
    `)).rows.map((row) => row.name);
    if (legacyEnums.length !== enumNames.length || legacyEnums.some((name) => !enumNames.includes(name))) {
      throw new Error("Legacy enum types differ from the expected definitions.");
    }

    const sourceColumns = (await client.query(`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User' ORDER BY column_name
    `)).rows.map((row) => row.name);
    const userColumns = ["id", "name", "email", "password", "role", "isActive", "lastLoginAt", "createdAt", "updatedAt"];
    if (JSON.stringify(sourceColumns) !== JSON.stringify([...userColumns].sort())) {
      throw new Error("Legacy User has unexpected columns; refusing to omit user data.");
    }
    const sourceProjection = userColumns.map((name) => name === "role" ? '"role"::text::"auth"."UserRole"' : quote(name)).join(", ");
    const targetProjection = userColumns.map(quote).join(", ");
    const sourceCount = Number((await client.query('SELECT count(*) AS count FROM "public"."User"')).rows[0].count);

    await client.query(readFileSync(new URL("./seed-roles.sql", import.meta.url), "utf8"));
    await client.query(`INSERT INTO "auth"."User" (${targetProjection}) SELECT ${sourceProjection} FROM "public"."User"`);
    const mismatch = (await client.query(`
      SELECT EXISTS (
        (SELECT ${sourceProjection} FROM "public"."User" EXCEPT SELECT ${targetProjection} FROM "auth"."User")
        UNION ALL
        (SELECT ${targetProjection} FROM "auth"."User" EXCEPT SELECT ${sourceProjection} FROM "public"."User")
      ) AS differs
    `)).rows[0].differs;
    if (mismatch) throw new Error("User preservation verification failed.");

    const legacySequence = (await client.query('SELECT last_value, is_called FROM "public"."User_id_seq"')).rows[0];
    const maxId = Number((await client.query('SELECT coalesce(max("id"), 0) AS id FROM "auth"."User"')).rows[0].id);
    const nextId = Math.max(maxId + 1, Number(legacySequence.last_value) + (legacySequence.is_called ? 1 : 0));
    if (!Number.isSafeInteger(nextId) || nextId < 1) throw new Error("Invalid User sequence value.");
    // ALTER SEQUENCE RESTART is transactional, unlike setval.
    await client.query(`ALTER SEQUENCE "auth"."User_id_seq" RESTART WITH ${nextId}`);

    // Drop the verified empty legacy tables together; User data was verified above.
    // No CASCADE: an unexpected dependency makes the entire transaction roll back.
    await client.query(`DROP TABLE ${legacyTables.map((name) => `"public".${quote(name)}`).join(", ")} RESTRICT`);
    await client.query(`DROP TYPE ${legacyEnums.map((name) => `"public".${quote(name)}`).join(", ")} RESTRICT`);
    await client.query('DROP SCHEMA "public" RESTRICT');
    await client.query('ALTER DATABASE "Odoo_hackathon" SET search_path TO "auth"');

    const remainingTables = Number((await client.query(`
      SELECT count(*) AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname IN ('auth','hr','attendance','leave','payroll','configuration')
    `)).rows[0].count);
    if (remainingTables !== models.length) throw new Error("Destination table count changed unexpectedly.");
    const publicRemains = (await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'public'")).rowCount > 0;
    if (publicRemains) throw new Error("public still exists.");
    await client.query("COMMIT");
    console.log(JSON.stringify({ removedSchema: "public", preservedUsers: sourceCount, remainingTables, defaultSchema: "auth" }));
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ error: error.code || error.name, message: error.message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
