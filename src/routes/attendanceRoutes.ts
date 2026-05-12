import { Router } from 'express';
import { createAttendance, getAttendance, getAttendanceByEmployeeId, checkIn, checkOut, getDailyStatus, getMyAttendance, getDashboardStats } from '../controllers/attendanceController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateMiddleware';
import { createAttendanceSchema, checkInSchema } from '../schemas/attendanceSchema';
import { db } from '../config/db';
import { holidays } from '../db/schema';
import { gte, eq, and } from 'drizzle-orm';

const router = Router();

router.use(authenticateJWT);

// Holiday Management (Inlined for debugging)
router.get('/holidays', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await db.select().from(holidays).where(gte(holidays.endDate, today)).orderBy(holidays.startDate);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/holidays', authorizeRole(['Admin', 'System Admin']), async (req, res, next) => {
  try {
    const { name, startDate, endDate } = req.body;
    const record = await db.insert(holidays).values({ name, startDate, endDate }).returning();
    res.status(201).json({ message: 'Holiday created successfully', record: record[0] });
  } catch (err) { next(err); }
});

router.delete('/holidays/:id', authorizeRole(['Admin', 'System Admin']), async (req, res, next) => {
  try {
    await db.delete(holidays).where(eq(holidays.id, Number(req.params.id)));
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

router.get('/dashboard-stats', getDashboardStats);
router.post('/check-in', validateRequest(checkInSchema), checkIn);
router.post('/check-out', checkOut);
router.get('/my-logs', getMyAttendance);

// Admin/HR endpoints
router.post('/', authorizeRole(['Admin', 'HR', 'System Admin']), validateRequest(createAttendanceSchema), createAttendance);
router.get('/', authorizeRole(['Admin', 'HR', 'System Admin']), getAttendance);
router.get('/daily-status', authorizeRole(['Admin', 'HR', 'System Admin']), getDailyStatus);
router.get('/:employeeId', authorizeRole(['Admin', 'HR', 'System Admin']), getAttendanceByEmployeeId);

// Holiday Management logic is inlined above for maximum stability.


export default router;
