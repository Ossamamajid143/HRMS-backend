import { pgTable, serial, varchar, timestamp, integer, date, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workPolicies = pgTable('work_policies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  checkInTime: varchar('check_in_time', { length: 10 }).notNull().default('09:00'),
  checkOutTime: varchar('check_out_time', { length: 10 }).notNull().default('17:00'),
  graceMinutes: integer('grace_minutes').notNull().default(15),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  roleId: integer('role_id').references(() => roles.id).notNull(),
  departmentId: integer('department_id').references(() => departments.id).notNull(),
  workPolicyId: integer('work_policy_id').references(() => workPolicies.id),
  status: varchar('status', { length: 50 }).notNull().default('Active'),
  isVerified: boolean('is_verified').notNull().default(false),
  verificationToken: varchar('verification_token', { length: 255 }),
  resetPasswordToken: varchar('reset_password_token', { length: 255 }),
  resetPasswordExpires: timestamp('reset_password_expires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    // Practical Example: B-Tree Index for faster search by name
    nameIdx: index('name_idx').on(table.name),
  };
});

export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'cascade' }).notNull(),
  date: date('date').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  checkInTime: timestamp('check_in_time').notNull(),
  checkOutTime: timestamp('check_out_time'),
  workedMinutes: integer('worked_minutes').default(0).notNull(),
  isLate: boolean('is_late').default(false).notNull(),
  isEarly: boolean('is_early').default(false).notNull(),
  overtimeMinutes: integer('overtime_minutes').default(0).notNull(),
  workMode: varchar('work_mode', { length: 50 }).default('In-Office').notNull(),
  clockInMethod: varchar('clock_in_method', { length: 50 }).default('System').notNull(),
}, (table) => {
  return {
    // Practical Example: Composite Index
    // Speeds up lookups that use BOTH employeeId and date (like in check-in checks)
    empDateIdx: index('emp_date_idx').on(table.employeeId, table.date),
  };
});

export const leaves = pgTable('leaves', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'cascade' }).notNull(),
  leaveType: varchar('leave_type', { length: 100 }).notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  comments: varchar('comments', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('Pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: varchar('content', { length: 2000 }).notNull(),
  createdBy: integer('created_by').references(() => employees.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const announcementReads = pgTable('announcement_reads', {
  id: serial('id').primaryKey(),
  announcementId: integer('announcement_id').references(() => announcements.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  readAt: timestamp('read_at').defaultNow().notNull(),
});

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
});
