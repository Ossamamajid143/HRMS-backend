import bcrypt from 'bcryptjs';
import { db } from '../config/db';
import { employees, departments, roles } from '../db/schema';
import { env } from '../config/env';
import { eq } from 'drizzle-orm';

export const seedAdmin = async () => {
  try {
    console.log('--- Checking for Admin Account ---');
    
    // 1. Ensure Department exists
    let dept = await db.select().from(departments).where(eq(departments.name, env.ADMIN_DEPARTMENT)).limit(1);
    if (dept.length === 0) {
      console.log(`Creating department: ${env.ADMIN_DEPARTMENT}`);
      dept = await db.insert(departments).values({ name: env.ADMIN_DEPARTMENT }).returning();
    }

    // 2. Ensure Role exists
    let role = await db.select().from(roles).where(eq(roles.name, 'Admin')).limit(1);
    if (role.length === 0) {
      console.log('Creating Admin role...');
      role = await db.insert(roles).values({ name: 'Admin' }).returning();
    }

    // 3. Check if admin already exists
    const existingAdmin = await db.select()
      .from(employees)
      .where(eq(employees.email, env.ADMIN_EMAIL))
      .limit(1);

    if (existingAdmin.length > 0) {
      console.log(`Admin account exists: ${env.ADMIN_EMAIL}`);
      return;
    }

    console.log('Seeding initial admin account...');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, salt);

    await db.insert(employees).values({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      passwordHash: passwordHash,
      roleId: role[0].id,
      departmentId: dept[0].id,
    });

    console.log(`Admin account created successfully: ${env.ADMIN_EMAIL}`);
  } catch (error) {
    console.error('Error seeding admin account:', error);
  }
};

export const seedSampleEmployees = async () => {
  try {
    console.log('--- Seeding Sample Employees ---');

    // 1. Ensure a few departments exist
    const deptNames = ['Engineering', 'Marketing', 'Human Resources', 'Sales'];
    const deptIds: number[] = [];

    for (const name of deptNames) {
      let dept = await db.select().from(departments).where(eq(departments.name, name)).limit(1);
      if (dept.length === 0) {
        const result = await db.insert(departments).values({ name }).returning();
        deptIds.push(result[0].id);
      } else {
        deptIds.push(dept[0].id);
      }
    }

    // 2. Ensure a few roles exist
    const roleNames = ['Manager', 'Developer', 'Designer'];
    const roleIds: number[] = [];

    for (const name of roleNames) {
      let role = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
      if (role.length === 0) {
        const result = await db.insert(roles).values({ name }).returning();
        roleIds.push(result[0].id);
      } else {
        roleIds.push(role[0].id);
      }
    }

    // 3. Add sample employees if table is mostly empty (other than admin)
    const existingEmployees = await db.select().from(employees).limit(10);
    if (existingEmployees.length > 1) {
      console.log('Sample employees already exist.');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    const sampleData = [
      { name: 'John Doe', email: 'john@example.com', roleId: roleIds[1], deptId: deptIds[0] },
      { name: 'Jane Smith', email: 'jane@example.com', roleId: roleIds[0], deptId: deptIds[1] },
      { name: 'Alice Johnson', email: 'alice@example.com', roleId: roleIds[2], deptId: deptIds[0] },
      { name: 'Bob Wilson', email: 'bob@example.com', roleId: roleIds[1], deptId: deptIds[3] },
    ];

    for (const data of sampleData) {
      await db.insert(employees).values({
        name: data.name,
        email: data.email,
        passwordHash: passwordHash,
        roleId: data.roleId,
        departmentId: data.deptId,
      });
    }

    console.log('Sample employees seeded successfully.');
  } catch (error) {
    console.error('Error seeding sample employees:', error);
  }
};
