import { Router } from 'express';
import { getOvertimeData } from '../controllers/overtimeController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

// Only Admins or HR can view overtime management
router.get('/', authenticateJWT, authorizeRole(['Admin', 'HR']), getOvertimeData);

export default router;
