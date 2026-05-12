import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { attendance, employees, workPolicies, leaves, holidays, announcementReads, announcements } from '../db/schema';
import { eq, desc, and, count, sql, gte, lte, isNull } from 'drizzle-orm';
import { AuthRequest } from '../middleware/authMiddleware';
import { calculateOvertime } from '../utils/overtimeCalculator';

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const checkIn = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user!.id;
    const { workMode = 'In-Office', clockInMethod = 'System' } = req.body;
    const now = new Date();
    const today = formatDate(now);

    // Check employee status and get work policy
    const employeeData = await db.select({
      id: employees.id,
      status: employees.status,
      workPolicy: {
        startTime: workPolicies.checkInTime,
        endTime: workPolicies.checkOutTime,
        lateThresholdMinutes: workPolicies.graceMinutes
      }
    })
    .from(employees)
    .leftJoin(workPolicies, eq(employees.workPolicyId, workPolicies.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

    const employee = employeeData[0];

    if (!employee || employee.status !== 'Active') {
      res.status(403).json({ message: 'Attendance denied: Employee is Inactive/Terminated' });
      return;
    }

    // Default policy if none assigned
    const policy = employee.workPolicy?.startTime ? employee.workPolicy : {
      startTime: '09:00',
      endTime: '17:00',
      lateThresholdMinutes: 15
    };

    // Check if user already checked in today
    const existing = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, today)))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ message: 'Already checked in for today' });
      return;
    }

    // Calculate isLate
    const [policyHour, policyMinute] = (policy.startTime || '09:00').split(':').map(Number);
    const checkInHour = now.getHours();
    const checkInMinute = now.getMinutes();
    const checkInTotalMinutes = checkInHour * 60 + checkInMinute;
    const policyTotalMinutes = policyHour * 60 + policyMinute;
    const isLate = checkInTotalMinutes > (policyTotalMinutes + (policy.lateThresholdMinutes || 15));

    const record = await db.insert(attendance).values({
      employeeId,
      date: today,
      checkInTime: now,
      status: isLate ? 'Late' : 'Present',
      isLate,
      workMode,
      clockInMethod
    }).returning();

    res.status(201).json({ message: 'Checked in successfully', record: record[0] });
  } catch (error) {
    next(error);
  }
};

export const checkOut = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user!.id;
    const now = new Date();
    const today = formatDate(now);

    // Get today's record and employee policy
    const existingData = await db.select({
      attendance: attendance,
      workPolicy: {
        startTime: workPolicies.checkInTime,
        endTime: workPolicies.checkOutTime,
        lateThresholdMinutes: workPolicies.graceMinutes
      }
    })
    .from(attendance)
    .leftJoin(employees, eq(attendance.employeeId, employees.id))
    .leftJoin(workPolicies, eq(employees.workPolicyId, workPolicies.id))
    .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, today)))
    .limit(1);

    if (existingData.length === 0) {
      res.status(404).json({ message: 'No check-in record found for today' });
      return;
    }

    const existing = existingData[0].attendance;
    const policy = (existingData[0].workPolicy && existingData[0].workPolicy.startTime) ? existingData[0].workPolicy : {
      startTime: '09:00',
      endTime: '17:00',
      lateThresholdMinutes: 15
    };

    if (existing.checkOutTime) {
      res.status(400).json({ message: 'Already checked out for today' });
      return;
    }

    // Calculate isEarly and overtime
    const [policyEndHour, policyEndMinute] = (policy.endTime || '17:00').split(':').map(Number);
    const checkOutHour = now.getHours();
    const checkOutMinute = now.getMinutes();
    const checkOutTotalMinutes = checkOutHour * 60 + checkOutMinute;
    const policyEndTotalMinutes = policyEndHour * 60 + policyEndMinute;

    const isEarly = checkOutTotalMinutes < policyEndTotalMinutes;
    const overtimeMinutes = calculateOvertime(now);

    // Calculate workedMinutes
    const workedMinutes = Math.floor((now.getTime() - existing.checkInTime.getTime()) / (1000 * 60));

    const record = await db.update(attendance)
      .set({ 
        checkOutTime: now,
        workedMinutes,
        isEarly,
        overtimeMinutes
      })
      .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, today)))
      .returning();

    res.json({ message: 'Checked out successfully', record: record[0] });
  } catch (error) {
    next(error);
  }
};

export const createAttendance = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, date, checkInTime, checkOutTime, status, workMode = 'In-Office', clockInMethod = 'System' } = req.body;
    
    const checkInDate = new Date(checkInTime);
    const checkOutDate = checkOutTime ? new Date(checkOutTime) : null;

    // Fetch policy for the employee
    const employeeData = await db.select({
      workPolicy: {
        startTime: workPolicies.checkInTime,
        endTime: workPolicies.checkOutTime,
        lateThresholdMinutes: workPolicies.graceMinutes
      }
    })
    .from(employees)
    .leftJoin(workPolicies, eq(employees.workPolicyId, workPolicies.id))
    .where(eq(employees.id, Number(employeeId)))
    .limit(1);

    const policy = (employeeData[0] && employeeData[0].workPolicy && employeeData[0].workPolicy.startTime) ? employeeData[0].workPolicy : {
      startTime: '09:00',
      endTime: '17:00',
      lateThresholdMinutes: 15
    };

    // Calculate values for manual entry
    const [policyHour, policyMinute] = (policy.startTime || '09:00').split(':').map(Number);
    const [policyEndHour, policyEndMinute] = (policy.endTime || '17:00').split(':').map(Number);
    const policyTotalMinutes = policyHour * 60 + policyMinute;
    const policyEndTotalMinutes = policyEndHour * 60 + policyEndMinute;

    const checkInTotalMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    const isLate = checkInTotalMinutes > (policyTotalMinutes + (policy.lateThresholdMinutes || 15));

    let isEarly = false;
    let overtimeMinutes = 0;
    if (checkOutDate) {
      const checkOutTotalMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
      isEarly = checkOutTotalMinutes < policyEndTotalMinutes;
      overtimeMinutes = Math.max(0, checkOutTotalMinutes - policyEndTotalMinutes);
    }

    const workedMinutes = checkOutDate ? Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60)) : 0;

    const record = await db.insert(attendance).values({
      employeeId,
      date,
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      status,
      workedMinutes,
      isLate,
      isEarly,
      overtimeMinutes,
      workMode,
      clockInMethod
    }).returning();

    res.status(201).json({ message: 'Attendance record created successfully', record: record[0] });
  } catch (error) {
    next(error);
  }
};

export const getAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const totalResult = await db.select({ value: count() }).from(attendance);
    const total = Number(totalResult[0].value);
    const totalPages = Math.ceil(total / limit);

    const data = await db.select({
      id: attendance.id,
      date: attendance.date,
      status: attendance.status,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      isLate: attendance.isLate,
      isEarly: attendance.isEarly,
      overtimeMinutes: attendance.overtimeMinutes,
      workedMinutes: attendance.workedMinutes,
      employeeId: attendance.employeeId,
      employeeName: employees.name,
      workMode: attendance.workMode,
      clockInMethod: attendance.clockInMethod
    })
    .from(attendance)
    .leftJoin(employees, eq(attendance.employeeId, employees.id))
    .orderBy(desc(attendance.date))
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

export const getAttendanceByEmployeeId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const totalResult = await db.select({ value: count() }).from(attendance).where(eq(attendance.employeeId, Number(employeeId)));
    const total = Number(totalResult[0].value);
    const totalPages = Math.ceil(total / limit);

    const data = await db.select().from(attendance)
      .where(eq(attendance.employeeId, Number(employeeId)))
      .orderBy(desc(attendance.date))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, total, totalPages, data });
  } catch (error) {
    next(error);
  }
};

export const getMyAttendance = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const totalResult = await db.select({ value: count() }).from(attendance).where(eq(attendance.employeeId, employeeId));
    const total = Number(totalResult[0].value);
    const totalPages = Math.ceil(total / limit);

    const data = await db.select().from(attendance)
      .where(eq(attendance.employeeId, employeeId))
      .orderBy(desc(attendance.date))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, total, totalPages, data });
  } catch (error) {
    next(error);
  }
};

export const getDailyStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = formatDate(new Date());
    const data = await db.select({
      employeeId: employees.id,
      employeeName: employees.name,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      isLate: attendance.isLate,
      isEarly: attendance.isEarly,
      overtimeMinutes: attendance.overtimeMinutes,
      workedMinutes: attendance.workedMinutes,
      status: attendance.status,
      workMode: attendance.workMode
    })
    .from(employees)
    .leftJoin(attendance, and(eq(employees.id, attendance.employeeId), eq(attendance.date, today)))
    .where(eq(employees.status, 'Active'));

    const activeCount = data.length;
    const presentCount = data.filter(e => e.checkInTime).length;

    res.json({ 
      date: today, 
      count: presentCount, 
      presentCount, 
      activeCount,
      employees: data 
    });
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'HR' || req.user?.role === 'System Admin';
    const employeeId = req.user?.id;
    const today = formatDate(new Date());

    const allEmployees = await db.select().from(employees).where(eq(employees.status, 'Active'));
    const totalEmployees = allEmployees.length;

    const dailyLogs = await db.select().from(attendance).where(eq(attendance.date, today));
    
    // Today's Attendance Stats
    const checkedIn = isAdmin ? dailyLogs.length : (dailyLogs.find(l => l.employeeId === employeeId) ? 1 : 0);
    const lateComing = dailyLogs.filter(l => l.isLate).length;
    const earlyGoing = dailyLogs.filter(l => l.isEarly).length;
    const checkedOut = dailyLogs.filter(l => l.checkOutTime).length;
    const wfhCount = dailyLogs.filter(l => l.workMode === 'WFH').length;
    const onDutyCount = dailyLogs.filter(l => l.workMode === 'On-Duty').length;
    const remoteCount = dailyLogs.filter(l => l.clockInMethod === 'Remote').length;

    // Today's Leave Stats
    const todayLeaves = await db.select().from(leaves)
      .where(and(lte(leaves.fromDate, today), gte(leaves.toDate, today), eq(leaves.status, 'Approved')));
    
    const paidLeave = todayLeaves.filter(l => l.leaveType === 'Annual Leave' || l.leaveType === 'Casual Leave').length;
    const unpaidLeave = todayLeaves.filter(l => l.leaveType === 'Unpaid Leave').length;
    const sickLeave = todayLeaves.filter(l => l.leaveType === 'Sick Leave').length;
    
    // AWOL (Absent Without Leave)
    const onLeaveEmployeeIds = new Array(...new Set(todayLeaves.map(l => l.employeeId)));
    const checkedInEmployeeIds = new Array(...new Set(dailyLogs.map(l => l.employeeId)));
    const awolCount = allEmployees.filter(e => !checkedInEmployeeIds.includes(e.id) && !onLeaveEmployeeIds.includes(e.id)).length;

    // Weekly Off & Holidays
    const dayOfWeek = new Date().getDay();
    const isWeeklyOff = dayOfWeek === 0 || dayOfWeek === 6;
    const weeklyOffCount = isWeeklyOff ? totalEmployees : 0;

    const todayHoliday = await db.select().from(holidays)
      .where(and(lte(holidays.startDate, today), gte(holidays.endDate, today)))
      .limit(1);
    const holidayCount = todayHoliday.length > 0 ? totalEmployees : 0;

    // Total Leave Balance calculation (assuming 30 days per employee per year)
    const totalPossibleBalance = totalEmployees * 30;
    const allApprovedLeaves = await db.select().from(leaves).where(eq(leaves.status, 'Approved'));
    const totalConsumedLeaves = allApprovedLeaves.reduce((acc, l) => {
      const start = new Date(l.fromDate);
      const end = new Date(l.toDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return acc + (isNaN(days) ? 0 : days);
    }, 0);
    const totalLeaveBalance = Math.max(0, totalPossibleBalance - totalConsumedLeaves);

    // Past Dates Aggregation (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const rangeLogs = await db.select().from(attendance)
      .where(and(gte(attendance.date, formatDate(sevenDaysAgo)), lte(attendance.date, today)));

    const totalPossibleSessions = totalEmployees * 7;
    const totalPresentSessions = rangeLogs.length;
    const presentPercentage = totalPossibleSessions > 0 ? (totalPresentSessions / totalPossibleSessions) * 100 : 0;

    const totalWorkedMinutes = rangeLogs.reduce((acc, log) => acc + (log.workedMinutes || 0), 0);
    const avgWorkHours = totalPresentSessions > 0 ? (totalWorkedMinutes / totalPresentSessions) / 60 : 0;

    const totalOvertimeMinutes = rangeLogs.reduce((acc, log) => acc + (log.overtimeMinutes || 0), 0);
    const avgOvertimeHours = totalPresentSessions > 0 ? (totalOvertimeMinutes / totalPresentSessions) / 60 : 0;

    const totalDiscrepancies = rangeLogs.filter(log => log.isLate || log.isEarly || !log.checkOutTime).length;

    // Previous 7 Days for Trends (Days 8 to 14 ago)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const prevRangeLogs = await db.select().from(attendance)
      .where(and(gte(attendance.date, formatDate(fourteenDaysAgo)), lte(attendance.date, formatDate(new Date(sevenDaysAgo.getTime() - 24 * 60 * 60 * 1000)))));

    const prevTotalPresentSessions = prevRangeLogs.length;
    const prevPresentPercentage = totalPossibleSessions > 0 ? (prevTotalPresentSessions / totalPossibleSessions) * 100 : 0;
    
    const prevTotalWorkedMinutes = prevRangeLogs.reduce((acc, log) => acc + (log.workedMinutes || 0), 0);
    const prevAvgWorkHours = prevTotalPresentSessions > 0 ? (prevTotalWorkedMinutes / prevTotalPresentSessions) / 60 : 0;

    const prevTotalOvertimeMinutes = prevRangeLogs.reduce((acc, log) => acc + (log.overtimeMinutes || 0), 0);
    const prevAvgOvertimeHours = prevTotalPresentSessions > 0 ? (prevTotalOvertimeMinutes / prevTotalPresentSessions) / 60 : 0;

    const prevTotalDiscrepancies = prevRangeLogs.filter(log => log.isLate || log.isEarly || !log.checkOutTime).length;

    const trends = {
      presentPercentage: presentPercentage - prevPresentPercentage,
      avgWorkHours: avgWorkHours > 0 && prevAvgWorkHours > 0 ? ((avgWorkHours - prevAvgWorkHours) / prevAvgWorkHours) * 100 : (avgWorkHours > 0 ? 100 : 0),
      avgOvertimeHours: avgOvertimeHours > 0 && prevAvgOvertimeHours > 0 ? ((avgOvertimeHours - prevAvgOvertimeHours) / prevAvgOvertimeHours) * 100 : (avgOvertimeHours > 0 ? 100 : 0),
      totalDiscrepancies: totalDiscrepancies > 0 && prevTotalDiscrepancies > 0 ? ((totalDiscrepancies - prevTotalDiscrepancies) / prevTotalDiscrepancies) * 100 : (totalDiscrepancies > 0 ? 100 : 0)
    };

    // Monthly Off Count (Weekends + Holidays for the current month)
    const yearNow = new Date().getFullYear();
    const monthNow = new Date().getMonth();
    const daysInMonthNow = new Date(yearNow, monthNow + 1, 0).getDate();
    
    let monthlyOffCount = 0;
    for (let day = 1; day <= daysInMonthNow; day++) {
      const date = new Date(yearNow, monthNow, day);
      if (date.getDay() === 0 || date.getDay() === 6) monthlyOffCount++;
    }

    const allHolidays = await db.select().from(holidays);
    allHolidays.forEach(h => {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate);
      if ((start.getFullYear() === yearNow && start.getMonth() === monthNow) || 
          (end.getFullYear() === yearNow && end.getMonth() === monthNow)) {
        const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        monthlyOffCount += duration;
      }
    });

    // Past Leave Stats (Last 7 Days)
    const rangeLeaves = await db.select().from(leaves)
      .where(and(gte(leaves.toDate, formatDate(sevenDaysAgo)), lte(leaves.fromDate, today), eq(leaves.status, 'Approved')));

    const totalLeaveDays = rangeLeaves.reduce((acc, l) => {
      const start = new Date(l.fromDate > formatDate(sevenDaysAgo) ? l.fromDate : formatDate(sevenDaysAgo));
      const end = new Date(l.toDate < today ? l.toDate : today);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return acc + days;
    }, 0);

    const avgLeaveTaken = totalEmployees > 0 ? (totalLeaveDays / totalEmployees) : 0;
    const unplannedLeaveTaken = rangeLeaves.filter(l => l.leaveType === 'Sick Leave' || l.leaveType === 'Casual Leave').length;
    const employeesOnLeavePercentage = totalPossibleSessions > 0 ? (totalLeaveDays / totalPossibleSessions) * 100 : 0;

    // Chart Data
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return formatDate(d);
    }).reverse();

    const charts = {
      labels: last7Days.map(d => {
        const date = new Date(d);
        return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`;
      }),
      onTime: last7Days.map(date => {
        const dayLogs = rangeLogs.filter(l => l.date === date);
        const total = dayLogs.length;
        const onTime = dayLogs.filter(l => !l.isLate).length;
        return total > 0 ? (onTime / total) * 100 : 0;
      }),
      overtime: last7Days.map(date => {
        const dayLogs = rangeLogs.filter(l => l.date === date);
        return dayLogs.reduce((acc, l) => acc + (l.overtimeMinutes || 0), 0) / 60;
      }),
      onTimeCounts: last7Days.map(date => rangeLogs.filter(l => l.date === date && !l.isLate).length),
      leaves: last7Days.map(date => rangeLeaves.filter(l => l.fromDate <= date && l.toDate >= date).length),
      unplannedLeaves: last7Days.map(date => rangeLeaves.filter(l => l.fromDate <= date && l.toDate >= date && (l.leaveType === 'Sick Leave' || l.leaveType === 'Casual Leave')).length),
      attendanceStacked: last7Days.map(date => {
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = allHolidays.some(h => date >= h.startDate && date <= h.endDate);
        const isOff = isWeekend || isHoliday;
        
        const dayLogs = rangeLogs.filter(l => l.date === date);
        const onTime = dayLogs.filter(l => !l.isLate).length;
        const late = dayLogs.filter(l => l.isLate).length;
        const leavesOnDay = rangeLeaves.filter(l => l.fromDate <= date && l.toDate >= date).length;
        
        return {
          date: `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`,
          earlyOnTime: onTime,
          lateArrival: late,
          noLogs: isOff ? 0 : Math.max(0, totalEmployees - onTime - late - leavesOnDay),
          holidayWeeklyOff: isOff ? totalEmployees : 0
        };
      }),
      attendanceStackedPercentage: last7Days.map(date => {
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = allHolidays.some(h => date >= h.startDate && date <= h.endDate);
        const isOff = isWeekend || isHoliday;
        
        const dayLogs = rangeLogs.filter(l => l.date === date);
        const onTime = dayLogs.filter(l => !l.isLate).length;
        const late = dayLogs.filter(l => l.isLate).length;
        const leavesOnDay = rangeLeaves.filter(l => l.fromDate <= date && l.toDate >= date).length;
        
        const total = totalEmployees || 1;
        return {
          date: `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`,
          earlyOnTime: (onTime / total) * 100,
          lateArrival: (late / total) * 100,
          noLogs: isOff ? 0 : (Math.max(0, totalEmployees - onTime - late - leavesOnDay) / total) * 100,
          holidayWeeklyOff: isOff ? 100 : 0
        };
      })
    };
    res.json({
      stats: {
        totalEmployees,
        checkedIn,
        notCheckedIn: Math.max(0, totalEmployees - checkedIn),
        lateComing,
        earlyGoing,
        checkedOut,
        onTimeCount: Math.max(0, checkedIn - lateComing),
        wfh: wfhCount,
        onDuty: onDutyCount,
        remote: remoteCount,
        weeklyOff: weeklyOffCount,
        holiday: holidayCount,
        presentPercentage: Math.round(presentPercentage),
        avgWorkHours: avgWorkHours.toFixed(1),
        avgOvertimeHours: avgOvertimeHours.toFixed(1),
        totalDiscrepancies,
        // Leave Stats
        paidLeave,
        unpaidLeave,
        sickLeave,
        awol: awolCount,
        employeesOnLeavePercentage: Math.round(employeesOnLeavePercentage),
        avgLeaveTaken: avgLeaveTaken.toFixed(1),
        totalLeaveBalance,
        unplannedLeaveTaken,
        monthlyOffCount,
        trends
      },
      charts
    });
  } catch (error) {
    next(error);
  }
};
