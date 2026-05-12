import { Router } from 'express';
import { createAnnouncement, getAnnouncements, markAsRead } from '../controllers/announcementController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

// Everyone can view
router.get('/', getAnnouncements);

// Only Admin and HR can create
router.post('/', authorizeRole(['Admin', 'HR']), createAnnouncement);

// Mark as read
router.post('/:id/read', markAsRead);

export default router;
