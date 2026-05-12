import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes';
import employeeRoutes from './routes/employeeRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import leaveRoutes from './routes/leaveRoutes';
import announcementRoutes from './routes/announcementRoutes';
import overtimeRoutes from './routes/overtimeRoutes';
import holidayRoutes from './routes/holidayRoutes';
import { errorHandler } from './middleware/errorHandlerMiddleware';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

const app = express();

// Middlewares
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/holidays', holidayRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/overtime', overtimeRoutes);


// Global Error Handler
app.use(errorHandler);

export default app;
