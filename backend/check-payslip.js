import prisma from './src/lib/prisma.js';
async function main() {
  const slip = await prisma.payslip.findUnique({
    where: { number: 'SLIP-f789fb90-bc9d-4146-850a-57cd8446472e' },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      lines: true,
      workedTime: true
    }
  });
  console.log("Payslip:", slip ? {
    netAmount: slip.netAmount,
    scheduledDays: slip.scheduledDays,
    workedDays: slip.workedDays,
    workedHours: slip.workedHours
  } : "Not found");
  if (slip) {
    console.log("Lines:");
    console.table(slip.lines.map(l => ({ code: l.code, name: l.name, amount: l.amount, quantity: l.quantity, total: l.total })));
    console.log("Worked time:");
    console.table(slip.workedTime.map(w => ({ code: w.code, days: w.days, hours: w.hours })));
  }
}
main().finally(() => prisma.$disconnect());
