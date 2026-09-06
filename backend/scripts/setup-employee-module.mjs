import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(
    await readFile(
      new URL("../../database/prisma/add-employee-module.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log(
    "Employee document storage, preferences and notification receipts are ready.",
  );
} finally {
  await client.end();
}
