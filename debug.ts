import { db } from './src/config/db';
import { roles, employees } from './src/db/schema';

async function debug() {
  const allRoles = await db.select().from(roles);
  console.log('--- Roles ---');
  console.table(allRoles);

  const allEmps = await db.select({
    name: employees.name,
    email: employees.email,
    roleId: employees.roleId
  }).from(employees);
  console.log('--- Employees ---');
  console.table(allEmps);
  
  process.exit(0);
}

debug();
