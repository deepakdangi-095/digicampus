import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import applicationRoutes from './modules/applications/application.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import careerRoutes from './modules/career/career.routes';
import campusPassRoutes from './modules/campusPass/campusPass.routes';
import announcementRoutes from './modules/announcements/announcement.routes';
import vaultRoutes from './modules/vault/vault.routes';
import seatingRoutes from './modules/seating/seating.routes';
import aiRoutes from './modules/ai/ai.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import feeRoutes from './modules/fees/fee.routes';
import appointmentRoutes from './modules/appointments/appointment.routes';
import peopleRoutes from './modules/people/people.routes';
import gateRoutes from './modules/gate/gate.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/applications', applicationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/student', careerRoutes); // /api/student/profile, /career-recommendations, /skills
router.use('/student', campusPassRoutes); // /api/student/qr-pass
router.use('/announcements', announcementRoutes);
router.use('/vault', vaultRoutes);
router.use('/admin', seatingRoutes); // /api/admin/generate-seating
router.use('/ai', aiRoutes); // chat, guidance, risk, study-plan, evaluate  ->  Python AI engine
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/fees', feeRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/people', peopleRoutes);
router.use('/gate', gateRoutes);

export default router;
