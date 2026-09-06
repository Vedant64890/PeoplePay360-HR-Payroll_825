import prisma from './src/lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({ where: { role: 'EMPLOYEE' } });
  const emps = await prisma.employee.findMany({ where: { userId: { in: users.map(u => u.id) } } });
  
  console.log('Users with EMPLOYEE role:', users.map(u => ({ id: u.id, name: u.name, email: u.email })));
  console.log('Linked Employees:', emps.map(e => ({ id: e.id, name: e.firstName + ' ' + e.lastName, userId: e.userId })));

  const praven = await prisma.employee.findFirst({ where: { firstName: { contains: 'praven', mode: 'insensitive' } } });
  console.log('Praven Kumar userId:', praven?.userId);
}

main().finally(() => prisma.$disconnect());
