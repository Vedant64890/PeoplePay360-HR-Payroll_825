import { Prisma } from "../generated/prisma/client.ts";
import AppError from "../utils/AppError.js";

export const D = (value = 0) => new Prisma.Decimal(value);
export const json = (value) => JSON.parse(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v));
export const fail = (message, status = 400) => { throw new AppError(message, status); };
export const date = (value) => new Date(value);
export const dayKey = (value) => new Date(value).toISOString().slice(0, 10);
export const addDays = (value, days) => new Date(new Date(value).getTime() + days * 86400000);
export const daysBetween = (start, end) => Math.round((date(end) - date(start)) / 86400000) + 1;
export function dateRange(start, end) {
  if (start > end || daysBetween(start, end) > 366) fail("Choose an ordered date range of at most 366 days.");
  return Array.from({ length: daysBetween(start, end) }, (_, i) => addDays(start, i));
}
export const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
export async function lockEmployee(tx, id) {
  const rows = await tx.$queryRaw`SELECT id FROM hr."Employee" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) fail("Employee not found.", 404);
}
export async function audit(tx, actorId, action, entityType, id, after) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId: String(id), ...(after ? { after: json(after) } : {}) } });
}
export function localParts(instant, timezone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}
export function localInstant(day, minutes, timezone) {
  const target = date(day).getTime() + minutes * 60000;
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (represented === target) return new Date(guess);
    guess += target - represented;
  }
  fail("This local shift time is invalid across a timezone clock change.");
}
export function scheduleDay(schedule, day) {
  const holiday = schedule?.holidays?.find(h => dayKey(h.date) === dayKey(day));
  const lines = (schedule?.lines || []).filter(l => l.day === weekdays[date(day).getUTCDay()]);
  const minutes = lines.reduce((n, l) => n + l.endMinute + l.endDayOffset * 1440 - l.startMinute - l.breakMinutes, 0);
  return { lines, minutes: holiday ? 0 : minutes, holiday };
}
export async function applicableSchedule(tx, employeeId, day) {
  const contracts = await tx.contract.findMany({ where: { employeeId, status: { in: ["OPEN", "EXPIRED", "TERMINATED"] }, startDate: { lte: day }, AND: [{ OR: [{ endDate: null }, { endDate: { gte: day } }] }, { OR: [{ terminationDate: null }, { terminationDate: { gte: day } }] }] }, include: { workingSchedule: { include: { lines: true, holidays: true } } } });
  if (contracts.length > 1) fail("Overlapping contracts must be resolved first.", 409);
  if (contracts[0]?.workingSchedule) return contracts[0].workingSchedule;
  const assignment = await tx.employeeScheduleAssignment.findFirst({ where: { employeeId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { workingSchedule: { include: { lines: true, holidays: true } } } });
  return assignment?.workingSchedule || null;
}

// Arithmetic-only grammar. No JavaScript, property access, calls or executable code.
export function expression(source, context = {}) {
  if (typeof source !== "string" || !source.trim() || source.length > 1000) fail("Enter a salary expression of 1–1000 characters.");
  const tokens = source.match(/\d+(?:\.\d+)?|[A-Z][A-Z0-9_]*|[()+*/-]/g) || [];
  if (tokens.join("") !== source.replace(/\s/g, "")) fail("Salary expressions support numbers, uppercase codes and + - * / parentheses only.");
  let pos = 0;
  function primary(depth) {
    if (depth > 40) fail("Salary expression is too deeply nested.");
    const token = tokens[pos++];
    if (token === "-" || token === "+") { const v = primary(depth + 1); return token === "-" ? v.negated() : v; }
    if (token === "(") { const v = sum(depth + 1); if (tokens[pos++] !== ")") fail("Unbalanced salary expression."); return v; }
    if (/^\d/.test(token || "")) return D(token);
    if (token && Object.hasOwn(context, token)) return D(context[token]);
    fail(`Unknown or out-of-order salary code: ${token || "end of expression"}.`);
  }
  function product(depth) {
    let value = primary(depth);
    while (["*", "/"].includes(tokens[pos])) { const op = tokens[pos++]; const right = primary(depth); if (op === "/" && right.isZero()) fail("Division by zero in salary rule."); value = op === "*" ? value.mul(right) : value.div(right); }
    return value;
  }
  function sum(depth) { let value = product(depth); while (["+", "-"].includes(tokens[pos])) { const op = tokens[pos++]; const right = product(depth); value = op === "+" ? value.plus(right) : value.minus(right); } return value; }
  const value = sum(0);
  if (pos !== tokens.length || !value.isFinite() || value.abs().gte("1000000000000000")) fail("Invalid or excessive salary expression result.");
  return value;
}

export function validateSchedule(lines) {
  const spans = lines.map(l => {
    const duration = l.endMinute + l.endDayOffset * 1440 - l.startMinute;
    if (duration <= 0 || duration > 1440 || l.breakMinutes >= duration) fail("Shift end must follow its start; breaks must be shorter than the shift.");
    const start = weekdays.indexOf(l.day) * 1440 + l.startMinute;
    return [start, start + duration];
  });
  const expanded = spans.flatMap(([s, e], i) => [[s, e, i], [s + 10080, e + 10080, i]]);
  for (let i = 0; i < expanded.length; i++) for (let j = i + 1; j < expanded.length; j++) {
    const [s, e, a] = expanded[i], [s2, e2, b] = expanded[j];
    if (a !== b && s < e2 && s2 < e) fail("Working schedule shifts cannot overlap, including overnight shifts.");
  }
}
