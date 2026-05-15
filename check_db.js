const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const orgs = await prisma.organization.findMany();
    console.log('Organizations:', JSON.stringify(orgs, null, 2));
    
    const employees = await prisma.employee.findMany();
    console.log('Employees count:', employees.length);
  } catch (err) {
    console.error('Error querying DB:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
