import { Router } from 'express';
import { getHolidays, createHoliday, deleteHoliday } from '../controllers/holidayController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticateJWT, getHolidays);
router.post('/', authenticateJWT, authorizeRole(['Admin', 'System Admin']), createHoliday);
router.delete('/:id', authenticateJWT, authorizeRole(['Admin', 'System Admin']), deleteHoliday);

export default router;
