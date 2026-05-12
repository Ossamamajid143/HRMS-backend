import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/db';
import { employees, departments, roles, attendance } from '../db/schema';
import { eq, ilike, or, SQL, count } from 'drizzle-orm';

export const createEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, roleId, departmentId } = req.body;

    const existingUser = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
    if (existingUser.length > 0) {
       res.status(400).json({ message: 'Email already in use' });
       return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.insert(employees).values({
      name,
      email,
      passwordHash,
      roleId,
      departmentId
    }).returning({
      id: employees.id,
      name: employees.name,
      email: employees.email,
    });

    res.status(201).json({ message: 'Employee created successfully', employee: newUser[0] });
  } catch (error) {
    next(error);
  }
};

export const getEmployees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();

    let condition: SQL | undefined;
    if (search) {
      condition = or(
        ilike(employees.name, `%${search}%`),
        ilike(employees.email, `%${search}%`)
      );
    }

    // Count total matching records
    const totalResult = await db.select({ value: count() }).from(employees).where(condition);
    const total = Number(totalResult[0].value);
    const totalPages = Math.ceil(total / limit);

    // Practical Example: INNER JOIN
    // We join employees with roles and departments to get the NAME instead of just the ID.
    const data = await db.select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: roles.name,
      department: departments.name,
      status: employees.status,
      createdAt: employees.createdAt
    }).from(employees)
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .where(condition)
      .limit(limit)
      .offset(offset);
    
    res.json({
      page,
      limit,
      total,
      totalPages,
      data
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Using innerJoin for specific employee
    const employeeRows = await db.select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: roles.name,
      department: departments.name,
      status: employees.status,
      createdAt: employees.createdAt
    }).from(employees)
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.id, Number(id)))
      .limit(1);

    if (employeeRows.length === 0) {
      res.status(404).json({ message: 'Employee not found' });
      return;
    }

    res.json(employeeRows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, roleId, departmentId, status } = req.body;

    const existing = await db.select().from(employees).where(eq(employees.id, Number(id))).limit(1);
    if (existing.length === 0) {
       res.status(404).json({ message: 'Employee not found' });
       return;
    }

    const updated = await db.update(employees).set({
      name: name ?? existing[0].name,
      roleId: roleId ?? existing[0].roleId,
      departmentId: departmentId ?? existing[0].departmentId,
      status: status ?? existing[0].status,
    }).where(eq(employees.id, Number(id))).returning({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      status: employees.status,
    });

    res.json({ message: 'Employee updated', employee: updated[0] });
  } catch (error) {
    next(error);
  }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const employeeId = Number(id);

    // Practical Example: TRANSACTIONS
    // We use a transaction to ensure that deleting the employee and their
    // attendance records is "Atomic". 
    // If one fails, the other is rolled back automatically.
    await db.transaction(async (tx) => {
      console.log(`Starting transaction for deleting employee ${employeeId}`);

      // 1. Delete all attendance records first
      await tx.delete(attendance).where(eq(attendance.employeeId, employeeId));
      
      // 2. Delete the employee
      const result = await tx.delete(employees).where(eq(employees.id, employeeId)).returning();

      if (result.length === 0) {
        // This will trigger a ROLLBACK of the attendance deletion!
        throw new Error('Employee not found');
      }

      console.log('Transaction completed successfully');
    });

    res.json({ message: 'Employee and all related records deleted permanently' });
  } catch (error: any) {
    if (error.message === 'Employee not found') {
      res.status(404).json({ message: error.message });
      return;
    }
    next(error);
  }
};
