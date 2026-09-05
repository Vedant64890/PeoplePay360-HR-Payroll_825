import prisma from "../lib/prisma.js";
import { audit, fail, json } from "../lib/workspace.js";

export const defaultSettings = { organizationName: "Your organization", supportEmail: null, defaultCurrency: "INR", timezone: "Asia/Kolkata", reportMonths: 6, version: 0 };
export async function getSettings(db = prisma) {
  return json(await db.workspaceSettings.findUnique({ where: { id: 1 } }) || defaultSettings);
}
export async function writeSettings(tx, input, actorId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(710360)`;
  const before = await getSettings(tx);
  if (before.version !== input.version) fail("Settings were updated elsewhere. Reload before saving your changes.", 409);
  const { version, ...data } = input;
  const saved = await tx.workspaceSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data, version: 1 }, update: { ...data, version: version + 1 } });
  await audit(tx, actorId, "WORKSPACE_SETTINGS_UPDATED", "WorkspaceSettings", 1, data);
  return json(saved);
}
export async function saveSettings(input, actorId) {
  return prisma.$transaction(tx => writeSettings(tx, input, actorId));
}
