import { Router } from 'express';
import { applyLeave, getMyLeaves, getAllLeaves, updateLeaveStatus } from '../controllers/leaveController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

// All leave routes require authentication
router.use(authenticateJWT);

// Employee routes
router.post('/apply', applyLeave);
router.get('/my-leaves', getMyLeaves);

// Admin routes
router.get('/', authorizeRole(['Admin']), getAllLeaves);
router.patch('/:id/status', authorizeRole(['Admin']), updateLeaveStatus);

export default router;
