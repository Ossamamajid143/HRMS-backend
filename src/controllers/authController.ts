import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { employees, roles, departments } from '../db/schema';
import { env } from '../config/env';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { sendResetPasswordEmail, sendVerificationEmail } from '../services/mailService';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let { name, email, password, roleId, departmentId } = req.body;

    const existingUser = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }

    // If no role or department provided (self-signup), try to find defaults
    if (!roleId) {
      const defaultRole = await db.select().from(roles).where(eq(roles.name, 'Developer')).limit(1);
      roleId = defaultRole[0]?.id || 1; // Fallback to ID 1 if not found
    }
    if (!departmentId) {
      const defaultDept = await db.select().from(departments).where(eq(departments.name, 'Engineering')).limit(1);
      departmentId = defaultDept[0]?.id || 1; // Fallback to ID 1 if not found
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newUser = await db.insert(employees).values({
      name,
      email,
      passwordHash,
      roleId,
      departmentId,
      isVerified: false,
      verificationToken
    }).returning({ id: employees.id, name: employees.name, email: employees.email });

    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({ message: 'User registered successfully. Please check your email to verify your account.', user: newUser[0] });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Join with roles to get the role name for the JWT
    const userRows = await db.select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      passwordHash: employees.passwordHash,
      role: roles.name,
      isVerified: employees.isVerified,
      createdAt: employees.createdAt,
    }).from(employees)
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .where(eq(employees.email, email))
      .limit(1);

    const user = userRows[0];

    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    if (!user.isVerified) {
      res.status(401).json({ message: 'Please verify your email address before logging in.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    next(error);
  }
};

export const googleLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token: googleToken } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ message: 'Invalid Google token' });
      return;
    }

    const { email, name, sub: googleId } = payload;

    // Check if user exists
    let userRows = await db.select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: roles.name,
      createdAt: employees.createdAt,
    }).from(employees)
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .where(eq(employees.email, email))
      .limit(1);

    let user = userRows[0];

    if (!user) {
      // Create new user if they don't exist
      const defaultRole = await db.select().from(roles).where(eq(roles.name, 'Developer')).limit(1);
      const roleId = defaultRole[0]?.id || 1;
      
      const defaultDept = await db.select().from(departments).where(eq(departments.name, 'Engineering')).limit(1);
      const departmentId = defaultDept[0]?.id || 1;

      const newUserRows = await db.insert(employees).values({
        name: name || 'Google User',
        email: email,
        passwordHash: 'GOOGLE_AUTH', // Placeholder for Google users
        roleId,
        departmentId,
        isVerified: true,
      }).returning({ id: employees.id, name: employees.name, email: employees.email, createdAt: employees.createdAt });

      const newUser = newUserRows[0];
      
      // Fetch role name for JWT
      const roleName = defaultRole[0]?.name || 'Employee';
      
      user = { ...newUser, role: roleName };
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: 'Google authentication failed' });
  }
};

export const getMetadata = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rolesList = await db.select({ id: roles.id, name: roles.name }).from(roles);
    const departmentsList = await db.select({ id: departments.id, name: departments.name }).from(departments);
    
    res.json({
      roles: rolesList,
      departments: departmentsList
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    const userRows = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
    const user = userRows[0];

    if (!user) {
      // For security reasons, don't confirm if user exists or not
      res.json({ message: 'If an account with that email exists, we have sent a reset link.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await db.update(employees)
      .set({
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires
      })
      .where(eq(employees.id, user.id));

    try {
      await sendResetPasswordEmail(user.email, resetToken);
      res.json({ message: 'If an account with that email exists, we have sent a reset link.' });
    } catch (mailError) {
      console.error('Mail error:', mailError);
      res.status(500).json({ message: 'Error sending email. Please try again later.' });
    }
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body;

    const userRows = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.resetPasswordToken, token),
          gt(employees.resetPasswordExpires, new Date())
        )
      )
      .limit(1);

    const user = userRows[0];

    if (!user) {
      res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await db.update(employees)
      .set({
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null
      })
      .where(eq(employees.id, user.id));

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string') {
       res.status(400).json({ message: 'Invalid token format.' });
       return;
    }

    const userRows = await db.select()
      .from(employees)
      .where(eq(employees.verificationToken, token))
      .limit(1);

    const user = userRows[0];

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired verification token.' });
      return;
    }

    await db.update(employees)
      .set({
        isVerified: true,
        verificationToken: null
      })
      .where(eq(employees.id, user.id));

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};
