import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { holidays } from '../db/schema';
import { eq, gte, desc } from 'drizzle-orm';
import { AuthRequest } from '../middleware/authMiddleware';

export const getHolidays = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await db.select()
      .from(holidays)
      .where(gte(holidays.endDate, today))
      .orderBy(holidays.startDate);
    
    res.json({ data });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    next(error);
  }
};

export const createHoliday = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      res.status(400).json({ message: 'Name, start date, and end date are required' });
      return;
    }

    const record = await db.insert(holidays).values({ 
      name, 
      startDate, 
      endDate 
    }).returning();
    res.status(201).json({ message: 'Holiday created successfully', record: record[0] });
  } catch (error) {
    console.error('Error creating holiday:', error);
    next(error);
  }
};

export const deleteHoliday = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await db.delete(holidays).where(eq(holidays.id, Number(id)));
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    next(error);
  }
};
