import { Router } from 'express';
import { register, login, getMetadata, forgotPassword, resetPassword, googleLogin, verifyEmail } from '../controllers/authController';
import { validateRequest } from '../middleware/validateMiddleware';
import { registerSchema, loginSchema } from '../schemas/authSchema';


const router = Router();

router.post('/register', validateRequest(registerSchema), register);
router.post('/login', validateRequest(loginSchema), login);
router.get('/metadata', getMetadata);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/google', googleLogin);
router.get('/verify-email/:token', verifyEmail);

export default router;
