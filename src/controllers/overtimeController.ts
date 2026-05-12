import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { attendance, employees } from '../db/schema';
import { eq, gt, and, gte, lte, sql } from 'drizzle-orm';

export const getOvertimeData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    let conditions = [gt(attendance.overtimeMinutes, 0)];

    if (startDate) conditions.push(gte(attendance.date, startDate as string));
    if (endDate) conditions.push(lte(attendance.date, endDate as string));
    if (employeeId) conditions.push(eq(attendance.employeeId, Number(employeeId)));

    // 1. Fetch Detailed Records
    const data = await db.select({
      employeeName: employees.name,
      date: attendance.date,
      overtimeMinutes: attendance.overtimeMinutes,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime
    })
    .from(attendance)
    .leftJoin(employees, eq(attendance.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(attendance.date);

    // 2. Fetch Summary Statistics using SQL Aggregation
    const summaryResult = await db.select({
      totalOvertimeMinutes: sql<number>`SUM(${attendance.overtimeMinutes})`,
      employeesWithOvertime: sql<number>`COUNT(DISTINCT ${attendance.employeeId})`,
      avgOvertimeMinutes: sql<number>`AVG(${attendance.overtimeMinutes})`
    })
    .from(attendance)
    .where(and(...conditions));

    const totalMinutes = Number(summaryResult[0].totalOvertimeMinutes || 0);
    const summary = {
      totalOvertimeHours: Number((totalMinutes / 60).toFixed(1)),
      employeesWithOvertime: Number(summaryResult[0].employeesWithOvertime || 0),
      avgOvertimePerEmployee: Number((Number(summaryResult[0].avgOvertimeMinutes || 0) / 60).toFixed(1))
    };

    res.json({ data, summary });
  } catch (error) {
    next(error);
  }
};
