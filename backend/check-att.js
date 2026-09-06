import prisma from './src/lib/prisma.js';
async function main() {
  const employee = await prisma.employee.findFirst({
    where: { firstName: { contains: 'praven', mode: 'insensitive' } }
  });
  console.log("Employee:", employee.id);
  const attendance = await prisma.attendance.findMany({
    where: { day: { employeeId: employee.id } }
  });
  console.table(attendance.map(a => ({ id: a.id, checkIn: a.checkIn, checkOut: a.checkOut, voidedAt: a.voidedAt })));
}
main().finally(() => prisma.$disconnect());
