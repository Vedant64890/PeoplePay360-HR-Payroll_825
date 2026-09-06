import { randomUUID } from "node:crypto";
import prisma from "../../src/lib/prisma.js";
import { hashPassword } from "../../src/lib/password.js";

export async function createEmployeeFixture() {
  const fixture = {
    tag: `emp${Date.now()}`,
    password: randomUUID(),
    users: [],
    employees: [],
    runs: [],
  };
  try {
    const password = await hashPassword(fixture.password);
    for (const [index, role] of [
      "EMPLOYEE",
      "EMPLOYEE",
      "HR_MANAGER",
    ].entries()) {
      fixture.users.push(
        await prisma.user.create({
          data: {
            name: `Employee QA ${index}`,
            email: `${fixture.tag}-${index}@example.test`,
            password,
            role,
          },
        }),
      );
    }
    fixture.department = await prisma.department.create({
      data: { code: fixture.tag, name: "Employee QA Team" },
    });
    fixture.position = await prisma.jobPosition.create({
      data: {
        code: fixture.tag,
        title: "Product Engineer",
        departmentId: fixture.department.id,
      },
    });
    fixture.schedule = await prisma.workingSchedule.create({
      data: {
        code: fixture.tag,
        name: "QA Standard Week",
        timezone: "Asia/Kolkata",
        lines: {
          create: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(
            (day) => ({
              day,
              startMinute: 540,
              endMinute: 1080,
              breakMinutes: 60,
            }),
          ),
        },
        holidays: {
          create: { date: new Date("2026-09-16"), name: "QA Company Holiday" },
        },
      },
    });
    for (const [index, user] of fixture.users.slice(0, 2).entries()) {
      const employee = await prisma.employee.create({
        data: {
          employeeCode: `${fixture.tag}-${index}`,
          userId: user.id,
          firstName: index ? "Jordan" : "Alex",
          lastName: "QA",
          workEmail: user.email,
          workPhone: "5550100200",
          personalEmail: "private@example.test",
          personalPhone: "PRIVATE_PHONE",
          addressLine1: "PRIVATE_ADDRESS",
          emergencyContactName: "PRIVATE_CONTACT",
          hireDate: new Date("2020-01-01"),
          status: "ACTIVE",
          departmentId: fixture.department.id,
          jobPositionId: fixture.position.id,
          workLocation: "Bengaluru",
        },
      });
      fixture.employees.push(employee);
      await prisma.employeeScheduleAssignment.create({
        data: {
          employeeId: employee.id,
          workingScheduleId: fixture.schedule.id,
          startDate: new Date("2020-01-01"),
        },
      });
    }
    fixture.structure = await prisma.salaryStructure.create({
      data: { code: fixture.tag, name: "QA Salary", currency: "INR" },
    });
    fixture.contract = await prisma.contract.create({
      data: {
        employeeId: fixture.employees[0].id,
        reference: fixture.tag,
        name: "Full-time employment",
        startDate: new Date("2020-01-01"),
        status: "OPEN",
        employeeType: "FULL_TIME",
        departmentId: fixture.department.id,
        jobPositionId: fixture.position.id,
        wage: "50000",
        currency: "INR",
        workingScheduleId: fixture.schedule.id,
        salaryStructureId: fixture.structure.id,
        terms: "QA employment terms.",
      },
    });
    const periodKey = {
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-30"),
      frequency: "CUSTOM",
    };
    fixture.period = await prisma.payrollPeriod.findUnique({
      where: { startDate_endDate_frequency: periodKey },
    });
    if (!fixture.period) {
      fixture.period = await prisma.payrollPeriod.create({
        data: { ...periodKey, name: fixture.tag },
      });
      fixture.createdPeriod = true;
    }
    fixture.slips = [];
    for (const [index, status] of ["VALIDATED", "DRAFT", "PAID"].entries()) {
      const employee = fixture.employees[index === 2 ? 1 : 0];
      const run = await prisma.payrun.create({
        data: {
          reference: `${fixture.tag}-${index}`,
          name: fixture.tag,
          payrollPeriodId: fixture.period.id,
          salaryStructureId: fixture.structure.id,
          currency: "INR",
          createdById: fixture.users[2].id,
          idempotencyKey: randomUUID(),
          employees: { create: { employeeId: employee.id } },
        },
      });
      fixture.runs.push(run);
      fixture.slips.push(
        await prisma.payslip.create({
          data: {
            number: `${fixture.tag}-${index}`,
            payrunId: run.id,
            employeeId: employee.id,
            payrollPeriodId: fixture.period.id,
            salaryStructureId: fixture.structure.id,
            employeeType: "FULL_TIME",
            periodStart: periodKey.startDate,
            periodEnd: periodKey.endDate,
            currency: "INR",
            status,
            basicAmount: "50000",
            grossAmount: "50000",
            deductionAmount: "5000",
            netAmount: "45000",
            employeeSnapshot: {
              firstName: employee.firstName,
              lastName: employee.lastName,
              employeeCode: employee.employeeCode,
            },
            structureSnapshot: { name: fixture.structure.name },
            validatedAt: status === "DRAFT" ? null : new Date(),
          },
        }),
      );
    }
    fixture.leaveType = await prisma.leaveType.create({
      data: {
        code: fixture.tag,
        name: "QA Personal Leave",
        requiresAllocation: false,
        requestApprovalPolicy: "SINGLE_APPROVAL",
      },
    });
    return fixture;
  } catch (error) {
    await cleanupEmployeeFixture(fixture);
    throw error;
  }
}

export async function cleanupEmployeeFixture(fixture) {
  const employeeIds = fixture.employees.map((e) => e.id),
    userIds = fixture.users.map((u) => u.id);
  const own = { employeeId: { in: employeeIds } },
    runs = { payrunId: { in: fixture.runs.map((r) => r.id) } };
  await prisma.payslipDocument.deleteMany({ where: { payslip: runs } });
  await prisma.payrollPayment.deleteMany({ where: { payslip: runs } });
  await prisma.payslipLine.deleteMany({ where: { payslip: runs } });
  await prisma.payslip.deleteMany({ where: runs });
  await prisma.payrunEmployee.deleteMany({ where: runs });
  await prisma.payrun.deleteMany({
    where: { id: { in: fixture.runs.map((r) => r.id) } },
  });
  if (fixture.createdPeriod)
    await prisma.payrollPeriod.deleteMany({
      where: {
        id: fixture.period.id,
        payruns: { none: {} },
        payslips: { none: {} },
      },
    });
  await prisma.contract.deleteMany({ where: own });
  await prisma.leaveRequestApproval.deleteMany({
    where: { leaveRequest: own },
  });
  await prisma.leaveRequestDay.deleteMany({ where: { leaveRequest: own } });
  await prisma.leaveRequest.deleteMany({ where: own });
  await prisma.attendance.deleteMany({ where: { day: own } });
  await prisma.attendanceDay.deleteMany({ where: own });
  await prisma.employeeScheduleAssignment.deleteMany({ where: own });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  if (fixture.leaveType)
    await prisma.leaveType.delete({ where: { id: fixture.leaveType.id } });
  if (fixture.structure)
    await prisma.salaryStructure.delete({
      where: { id: fixture.structure.id },
    });
  if (fixture.schedule)
    await prisma.workingSchedule.delete({ where: { id: fixture.schedule.id } });
  if (fixture.position)
    await prisma.jobPosition.delete({ where: { id: fixture.position.id } });
  if (fixture.department)
    await prisma.department.delete({ where: { id: fixture.department.id } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
