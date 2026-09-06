import prisma from "../lib/prisma.js";
import {
  audit,
  date,
  dateRange,
  dayKey,
  fail,
  json,
  localParts,
  lockEmployee,
  scheduleDay,
} from "../lib/workspace.js";
import { comparePassword, hashPassword } from "../lib/password.js";
import { ownEmployee } from "./employee.service.js";
import { getSettings } from "./settings.service.js";

export const defaultEmployeePreferences = {
  theme: "system",
  timeFormat: "12h",
  weekStartsOn: 1,
  defaultSection: "overview",
  attendanceReminders: true,
  leaveUpdates: true,
  payrollUpdates: true,
  documentUpdates: true,
};
export async function employeePreferences(userId) {
  const employee = await ownEmployee(userId);
  const saved = await prisma.employeePreferences.findUnique({
    where: { employeeId: employee.id },
  });
  return Object.fromEntries(
    Object.keys(defaultEmployeePreferences).map((key) => [
      key,
      saved?.[key] ?? defaultEmployeePreferences[key],
    ]),
  );
}
export async function saveEmployeePreferences(userId, input) {
  const employee = await ownEmployee(userId);
  await prisma.employeePreferences.upsert({
    where: { employeeId: employee.id },
    create: { employeeId: employee.id, ...input },
    update: input,
  });
  return input;
}
export async function changeEmployeePassword(userId, input) {
  await ownEmployee(userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await comparePassword(input.currentPassword, user.password)))
    fail("Current password is incorrect.", 400);
  const password = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    const saved = await tx.user.updateMany({
      where: {
        id: userId,
        password: user.password,
        sessionVersion: user.sessionVersion,
      },
      data: { password, sessionVersion: { increment: 1 } },
    });
    if (!saved.count)
      fail("Account credentials changed. Sign in again before retrying.", 409);
    await tx.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await audit(tx, userId, "EMPLOYEE_PASSWORD_CHANGED", "User", userId);
  });
  return { requiresLogin: true };
}
export async function employeeContacts(userId, { q, departmentId, page }) {
  const employee = await ownEmployee(userId);
  const visible = {
    status: { in: ["ACTIVE", "ONBOARDING", "ON_LEAVE"] },
    archivedAt: null,
    user: { is: { isActive: true } },
  };
  const where = {
    ...visible,
    ...(departmentId ? { departmentId } : {}),
    ...(q
      ? {
          OR: ["firstName", "lastName", "workEmail", "employeeCode"]
            .map((key) => ({ [key]: { contains: q, mode: "insensitive" } }))
            .concat([
              { department: { name: { contains: q, mode: "insensitive" } } },
              { jobPosition: { title: { contains: q, mode: "insensitive" } } },
            ]),
        }
      : {}),
  };
  const [items, total, departments] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        workPhone: true,
        workLocation: true,
        department: { select: { name: true } },
        jobPosition: { select: { title: true } },
      },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * 24,
      take: 24,
    }),
    prisma.employee.count({ where }),
    prisma.department.findMany({
      where: { employees: { some: visible } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { items, total, page, pageSize: 24, departments, ownId: employee.id };
}
export async function employeeSchedule(userId, month) {
  const employee = await ownEmployee(userId),
    start = date(`${month}-01`),
    end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
  const overlap = {
    employeeId: employee.id,
    startDate: { lte: end },
    OR: [{ endDate: null }, { endDate: { gte: start } }],
  };
  const include = {
    workingSchedule: {
      include: { lines: { orderBy: { sequence: "asc" } }, holidays: true },
    },
  };
  const [contracts, assignments, leave, settings] = await Promise.all([
    prisma.contract.findMany({
      where: { ...overlap, status: { in: ["OPEN", "EXPIRED", "TERMINATED"] } },
      include,
    }),
    prisma.employeeScheduleAssignment.findMany({
      where: overlap,
      include,
      orderBy: { startDate: "desc" },
    }),
    prisma.leaveRequestDay.findMany({
      where: {
        date: { gte: start, lte: end },
        leaveRequest: { employeeId: employee.id, status: "APPROVED" },
      },
      select: {
        date: true,
        durationDays: true,
        durationHours: true,
        leaveRequest: { select: { leaveType: { select: { name: true } } } },
      },
    }),
    getSettings(),
  ]);
  const p = localParts(new Date(), settings.timezone),
    today = `${p.year}-${p.month}-${p.day}`;
  const active = (r, day) =>
    r.startDate <= day &&
    (!r.endDate || r.endDate >= day) &&
    (!r.terminationDate || r.terminationDate >= day);
  const days = dateRange(start, end).map((day) => {
    const applicable = contracts.filter((c) => active(c, day));
    if (applicable.length > 1)
      fail("Overlapping contracts must be resolved by HR.", 409);
    const schedule =
      applicable[0]?.workingSchedule ||
      assignments.find((a) => active(a, day))?.workingSchedule;
    const employed =
      employee.hireDate <= day &&
      (!employee.terminationDate || employee.terminationDate >= day);
    const work = employed
      ? scheduleDay(schedule, day)
      : { lines: [], minutes: 0 };
    const absences = leave.filter((l) => dayKey(l.date) === dayKey(day));
    return {
      date: dayKey(day),
      scheduleName: employed ? schedule?.name : null,
      timezone: schedule?.timezone || settings.timezone,
      minutes: work.minutes,
      status: !employed
        ? "OUTSIDE_EMPLOYMENT"
        : !schedule
          ? "UNASSIGNED"
          : work.holiday
            ? "HOLIDAY"
            : absences.length
              ? "ON_LEAVE"
              : work.minutes
                ? "WORKING"
                : "REST_DAY",
      lines: work.lines,
      holiday: work.holiday?.name || null,
      leave: absences.map((l) => ({
        name: l.leaveRequest.leaveType.name,
        days: l.durationDays,
        hours: l.durationHours,
      })),
    };
  });
  return json({
    month,
    today,
    days,
    scheduledHours: days.reduce((n, d) => n + d.minutes, 0) / 60,
    workingDays: days.filter((d) => d.minutes > 0).length,
  });
}

export const documentMetadata = {
  id: true,
  title: true,
  category: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  createdAt: true,
};
export async function employeeDocuments(userId) {
  const employee = await ownEmployee(userId);
  return json(
    await prisma.employeeDocument.findMany({
      where: { employeeId: employee.id },
      select: documentMetadata,
      orderBy: { createdAt: "desc" },
    }),
  );
}
export async function uploadEmployeeDocument(
  userId,
  metadata,
  mimeType,
  content,
) {
  const employee = await ownEmployee(userId);
  if (
    !Buffer.isBuffer(content) ||
    !content.length ||
    content.length > 5 * 1024 * 1024
  )
    fail("Choose a non-empty file up to 5 MB.");
  const matches =
    mimeType === "application/pdf"
      ? content.subarray(0, 5).toString() === "%PDF-"
      : mimeType === "image/png"
        ? content
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === "image/jpeg" &&
          content[0] === 255 &&
          content[1] === 216 &&
          content[2] === 255;
  if (!matches)
    fail(
      "Only PDF, PNG and JPEG files with matching file contents are accepted.",
    );
  const extension =
    mimeType === "application/pdf"
      ? ".pdf"
      : mimeType === "image/png"
        ? ".png"
        : ".jpg";
  const fileName =
    metadata.fileName.replace(/\.[^.]+$/, "").slice(0, 170) + extension;
  return prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employee.id);
    const usage = await tx.employeeDocument.aggregate({
      where: { employeeId: employee.id },
      _sum: { byteSize: true },
      _count: true,
    });
    if (
      usage._count >= 100 ||
      (usage._sum.byteSize || 0) + content.length > 50 * 1024 * 1024
    )
      fail(
        "Your document storage is full (100 files or 50 MB). Remove an old file before uploading.",
        409,
      );
    const saved = await tx.employeeDocument.create({
      data: {
        ...metadata,
        fileName,
        employeeId: employee.id,
        mimeType,
        byteSize: content.length,
        content,
      },
      select: documentMetadata,
    });
    await audit(
      tx,
      userId,
      "EMPLOYEE_DOCUMENT_UPLOADED",
      "EmployeeDocument",
      saved.id,
    );
    return json(saved);
  });
}
export async function downloadEmployeeDocument(userId, id) {
  const employee = await ownEmployee(userId);
  const document = await prisma.employeeDocument.findFirst({
    where: { id, employeeId: employee.id },
  });
  if (!document) fail("Document not found.", 404);
  return document;
}
export async function deleteEmployeeDocument(userId, id) {
  const employee = await ownEmployee(userId);
  return prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employee.id);
    const result = await tx.employeeDocument.deleteMany({
      where: { id, employeeId: employee.id },
    });
    if (!result.count) fail("Document not found.", 404);
    await audit(
      tx,
      userId,
      "EMPLOYEE_DOCUMENT_DELETED",
      "EmployeeDocument",
      id,
    );
    return { id };
  });
}
