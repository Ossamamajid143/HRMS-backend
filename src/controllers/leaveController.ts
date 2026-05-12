import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { leaves, employees } from '../db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { AuthRequest } from '../middleware/authMiddleware';

export const applyLeave = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user!.id;
    const { leaveType, fromDate, toDate, comments } = req.body;

    if (!leaveType || !fromDate || !toDate) {
      res.status(400).json({ message: 'Missing required fields: leaveType, fromDate, and toDate are required.' });
      return;
    }

    const record = await db.insert(leaves).values({
      employeeId,
      leaveType,
      fromDate,
      toDate,
      comments,
      status: 'Pending',
    }).returning();

    res.status(201).json({ message: 'Leave applied successfully', record: record[0] });
  } catch (error) {
    next(error);
  }
};

export const getMyLeaves = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user!.id;
    
    const data = await db.select()
      .from(leaves)
      .where(eq(leaves.employeeId, employeeId))
      .orderBy(desc(leaves.createdAt));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const getAllLeaves = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await db.select({
      id: leaves.id,
      employeeId: leaves.employeeId,
      employeeName: employees.name,
      leaveType: leaves.leaveType,
      fromDate: leaves.fromDate,
      toDate: leaves.toDate,
      status: leaves.status,
      comments: leaves.comments,
      createdAt: leaves.createdAt,
    })
    .from(leaves)
    .leftJoin(employees, eq(leaves.employeeId, employees.id))
    .orderBy(desc(leaves.createdAt));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const updateLeaveStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const record = await db.update(leaves)
      .set({ status })
      .where(eq(leaves.id, Number(id)))
      .returning();

    res.json({ message: `Leave ${status}`, record: record[0] });
  } catch (error) {
    next(error);
  }
};
