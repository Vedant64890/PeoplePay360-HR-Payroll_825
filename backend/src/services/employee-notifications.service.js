import prisma from "../lib/prisma.js";
import { dayKey, fail, json } from "../lib/workspace.js";
import { ownEmployee } from "./employee.service.js";
import { employeePreferences } from "./employee-workspace.service.js";
import { releasedStatuses } from "./employee-payroll.service.js";

// Project real business records rather than creating duplicate notifications on refresh.
// Receipts persist independently, and a changed decision has a new event key.
export async function employeeNotifications(userId) {
  const employee = await ownEmployee(userId),
    employeeId = employee.id;
  const preferences = await employeePreferences(userId);
  const [requests, allocations, slips, documents] = await Promise.all([
    preferences.leaveUpdates
      ? prisma.leaveRequest.findMany({
          where: { employeeId, status: { not: "DRAFT" } },
          include: { leaveType: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [],
    preferences.leaveUpdates
      ? prisma.leaveAllocation.findMany({
          where: {
            employeeId,
            status: { in: ["APPROVED", "REFUSED", "CANCELLED"] },
          },
          include: { leaveType: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [],
    preferences.payrollUpdates
      ? prisma.payslip.findMany({
          where: { employeeId, status: { in: releasedStatuses } },
          select: {
            id: true,
            number: true,
            status: true,
            periodEnd: true,
            validatedAt: true,
            paidAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [],
    preferences.documentUpdates
      ? prisma.employeeDocument.findMany({
          where: { employeeId },
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
  ]);
  const event = (kind, item, at, title, message, section) => ({
    key: `${kind}:${item.id}:${item.status || "UPLOADED"}:${at.toISOString()}`,
    category: kind,
    title,
    message,
    section,
    month: dayKey(
      item.startDate || item.periodEnd || item.validFrom || at,
    ).slice(0, 7),
    createdAt: at,
  });
  const human = (value) => value.toLowerCase().replaceAll("_", " ");
  const items = [
    ...requests.map((r) =>
      event(
        "leave",
        r,
        r.updatedAt,
        `${r.leaveType.name}: ${human(r.status)}`,
        `${dayKey(r.startDate)} to ${dayKey(r.endDate)}${r.refusalReason ? ` · ${r.refusalReason}` : ""}`,
        "leave",
      ),
    ),
    ...allocations.map((a) =>
      event(
        "allocation",
        a,
        a.updatedAt,
        `${a.leaveType.name} allocation ${human(a.status)}`,
        `${a.amount} ${human(a.unit)} · ${a.name}`,
        "balances",
      ),
    ),
    ...slips.map((s) =>
      event(
        "payroll",
        s,
        s.updatedAt,
        s.status === "PAID"
          ? "Salary payment recorded"
          : s.status === "PARTIALLY_PAID"
            ? "Partial salary payment recorded"
            : "Your payslip is ready",
        `${s.number} · Period ending ${dayKey(s.periodEnd)}`,
        "payslips",
      ),
    ),
    ...documents.map((d) =>
      event(
        "document",
        d,
        d.createdAt,
        "Document uploaded",
        d.title,
        "documents",
      ),
    ),
  ].sort((a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key));
  const reads = await prisma.employeeNotificationRead.findMany({
    where: { employeeId, eventKey: { in: items.map((i) => i.key) } },
    select: { eventKey: true, readAt: true },
  });
  const readMap = new Map(reads.map((r) => [r.eventKey, r.readAt]));
  return json({
    items: items.map((i) => ({ ...i, readAt: readMap.get(i.key) || null })),
    unread: items.filter((i) => !readMap.has(i.key)).length,
  });
}
export async function markEmployeeNotifications(userId, keys) {
  const employee = await ownEmployee(userId),
    feed = await employeeNotifications(userId);
  const allowed = new Set(feed.items.map((i) => i.key));
  if (keys.some((key) => !allowed.has(key)))
    fail(
      "One or more notifications are unavailable. Refresh your notifications.",
      404,
    );
  await prisma.employeeNotificationRead.createMany({
    data: [...new Set(keys)].map((eventKey) => ({
      employeeId: employee.id,
      eventKey,
    })),
    skipDuplicates: true,
  });
  return { marked: new Set(keys).size };
}
