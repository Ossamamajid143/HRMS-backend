import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { announcements, employees, announcementReads } from '../db/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { AuthRequest } from '../middleware/authMiddleware';

export const createAnnouncement = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const createdBy = req.user?.id;
    const { title, content } = req.body;

    console.log('Announcement Request:', { createdBy, title, content, user: req.user });

    if (!title || !content) {
      res.status(400).json({ message: 'Title and content are required' });
      return;
    }

    if (!createdBy) {
      res.status(401).json({ message: 'User session invalid. Please re-login.' });
      return;
    }

    const record = await db.insert(announcements).values({
      title,
      content,
      createdBy,
    }).returning();

    res.status(201).json({ message: 'Announcement posted', record: record[0] });
  } catch (error: any) {
    console.error('CRITICAL: Announcement Insert Failed:', error);
    res.status(500).json({ message: error.message || 'Database error occurred' });
  }
};

export const getAnnouncements = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user?.id;

    const data = await db.select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      createdAt: announcements.createdAt,
      author: employees.name,
      isRead: announcementReads.id, // Will be null if no read record exists
    })
    .from(announcements)
    .leftJoin(employees, eq(announcements.createdBy, employees.id))
    .leftJoin(announcementReads, and(
      eq(announcementReads.announcementId, announcements.id),
      eq(announcementReads.employeeId, employeeId || -1)
    ))
    .orderBy(desc(announcements.createdAt));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = req.user?.id;
    const announcementId = parseInt(req.params.id as string);

    if (!employeeId || !announcementId) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    // Check if already read
    const existing = await db.select().from(announcementReads)
      .where(and(eq(announcementReads.announcementId, announcementId), eq(announcementReads.employeeId, employeeId)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(announcementReads).values({
        announcementId,
        employeeId
      });
    }

    // Check if seen by all
    const totalEmployeesResult = await db.select({ value: count() }).from(employees);
    const totalEmployees = Number(totalEmployeesResult[0].value);

    const totalReadsResult = await db.select({ value: count() }).from(announcementReads)
      .where(eq(announcementReads.announcementId, announcementId));
    const totalReads = Number(totalReadsResult[0].value);

    if (totalReads >= totalEmployees) {
      // Delete announcement
      await db.delete(announcementReads).where(eq(announcementReads.announcementId, announcementId));
      await db.delete(announcements).where(eq(announcements.id, announcementId));
    }

    res.json({ message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
};
