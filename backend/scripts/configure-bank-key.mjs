import { randomBytes } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const file = fileURLToPath(new URL("../.env", import.meta.url));
const source = await readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
if (/^\s*BANK_ENCRYPTION_KEY\s*=/m.test(source)) {
  console.log("BANK_ENCRYPTION_KEY already exists. The existing key was preserved.");
} else {
  await appendFile(file, `\nBANK_ENCRYPTION_KEY="${randomBytes(32).toString("hex")}"\n`);
  console.log("A private bank encryption key was added to backend/.env. Keep this key with your database backups.");
}
