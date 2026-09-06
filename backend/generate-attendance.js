import prisma from './src/lib/prisma.js';
import { saveAttendance } from './src/services/time.service.js';
import { dayKey, dateRange } from './src/lib/workspace.js';

async function main() {
  const employee = await prisma.employee.findFirst({
    where: { firstName: { contains: 'praven', mode: 'insensitive' } }
  });
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  // 1. Close any open sessions
  const openSessions = await prisma.attendance.findMany({
    where: { day: { employeeId: employee.id }, checkOut: null, voidedAt: null }
  });
  
  for (const session of openSessions) {
    console.log(`Closing open session ${session.id}...`);
    // Just void it so it doesn't mess up our generation
    await prisma.attendance.update({
      where: { id: session.id },
      data: { voidedAt: new Date() }
    });
  }

  // 2. Generate attendance for August 2026
  const start = new Date('2026-08-01T00:00:00Z');
  const end = new Date('2026-08-31T00:00:00Z');
  
  let count = 0;
  for (const day of dateRange(start, end)) {
    if (![0, 6].includes(day.getUTCDay())) {
      const checkInTime = `${dayKey(day)}T03:30:00Z`;
      const checkOutTime = `${dayKey(day)}T12:30:00Z`;
      try {
        await saveAttendance({
          employeeId: employee.id,
          checkIn: checkInTime,
          checkOut: checkOutTime,
          breakMinutes: 60,
          notes: "Auto-generated attendance"
        }, actor.id);
        count++;
      } catch (err) {
        if (!err.message.includes('overlapping')) {
          console.error(`Failed for ${dayKey(day)}:`, err.message);
        }
      }
    }
  }
  console.log(`Generated ${count} attendance records for ${employee.firstName}.`);
}

main().finally(() => prisma.$disconnect());
