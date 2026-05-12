import { Router } from 'express';
import { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee } from '../controllers/employeeController';
import { authenticateJWT, authorizeRole } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateMiddleware';
import { createEmployeeSchema, updateEmployeeSchema } from '../schemas/employeeSchema';

const router = Router();

router.get('/', getEmployees);

router.use(authenticateJWT);
router.get('/:id', getEmployeeById);

// Protected routes for Admin/HR only
router.post('/', authorizeRole(['Admin', 'HR']), validateRequest(createEmployeeSchema), createEmployee);
router.put('/:id', authorizeRole(['Admin', 'HR']), validateRequest(updateEmployeeSchema), updateEmployee);
router.delete('/:id', authorizeRole(['Admin', 'HR']), deleteEmployee);

export default router;
