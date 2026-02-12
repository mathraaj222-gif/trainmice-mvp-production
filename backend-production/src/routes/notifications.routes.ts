import express, { Response } from 'express';
import prisma from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { admin } from '../config/firebaseAdmin';

const router = express.Router();

router.use(authenticate);

// Get notifications for authenticated user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', type, isRead } = req.query;
    const userId = req.user!.id;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { userId };
    if (type) {
      where.type = type as string;
    }
    if (isRead !== undefined) {
      where.isRead = isRead === 'true';
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.notification.count({ where }),
    ]);

    return res.json({
      notifications,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Ensure user can only mark their own notifications as read
    if (notification.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });

    return res.json({ notification: updated });
  } catch (error: any) {
    console.error('Mark notification as read error:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read', details: error.message });
  }
});

// ========== Firebase Cloud Messaging Endpoints ==========

// Send message notification to trainer via FCM
router.post('/admin/send-message', async (req: AuthRequest, res: Response) => {
  try {
    const { trainerId, messageText } = req.body;

    // Validate input
    if (!trainerId || !messageText) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'trainerId and messageText are required'
      });
    }

    // Fetch trainer's user record to get FCM token
    const trainer = await prisma.user.findUnique({
      where: { id: trainerId },
      select: { fcmToken: true, fullName: true, role: true }
    });

    if (!trainer) {
      return res.status(404).json({ error: 'Trainer not found' });
    }

    // Check if user is actually a trainer
    if (trainer.role !== 'TRAINER') {
      return res.status(400).json({ error: 'User is not a trainer' });
    }

    // Check if trainer has FCM token
    if (!trainer.fcmToken) {
      console.warn(`Trainer ${trainerId} does not have an FCM token registered`);
      return res.status(200).json({
        success: true,
        message: 'Trainer does not have FCM token registered. Notification not sent.',
        fcmTokenMissing: true
      });
    }

    // Send FCM notification
    await admin.messaging().send({
      token: trainer.fcmToken,
      data: {
        type: 'MESSAGE',
        title: 'New Message from Admin',
        body: messageText
      },
      notification: {
        title: 'New Message from Admin',
        body: messageText
      }
    });

    console.log(`✅ Message notification sent to trainer ${trainerId}`);
    return res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error: any) {
    console.error('Send message notification error:', error);

    // Handle Firebase-specific errors
    if (error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered') {
      return res.status(400).json({
        error: 'Invalid or expired FCM token',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Failed to send notification',
      details: error.message
    });
  }
});

// Send general notification to trainer via FCM
router.post('/admin/send-notification', async (req: AuthRequest, res: Response) => {
  try {
    const { trainerId, notificationText } = req.body;

    // Validate input
    if (!trainerId || !notificationText) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'trainerId and notificationText are required'
      });
    }

    // Fetch trainer's user record to get FCM token
    const trainer = await prisma.user.findUnique({
      where: { id: trainerId },
      select: { fcmToken: true, fullName: true, role: true }
    });

    if (!trainer) {
      return res.status(404).json({ error: 'Trainer not found' });
    }

    // Check if user is actually a trainer
    if (trainer.role !== 'TRAINER') {
      return res.status(400).json({ error: 'User is not a trainer' });
    }

    // Check if trainer has FCM token
    if (!trainer.fcmToken) {
      console.warn(`Trainer ${trainerId} does not have an FCM token registered`);
      return res.status(200).json({
        success: true,
        message: 'Trainer does not have FCM token registered. Notification not sent.',
        fcmTokenMissing: true
      });
    }

    // Send FCM notification
    await admin.messaging().send({
      token: trainer.fcmToken,
      data: {
        type: 'NOTIFICATION',
        title: 'New Notification',
        body: notificationText
      },
      notification: {
        title: 'New Notification',
        body: notificationText
      }
    });

    console.log(`✅ General notification sent to trainer ${trainerId}`);
    return res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error: any) {
    console.error('Send general notification error:', error);

    // Handle Firebase-specific errors
    if (error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered') {
      return res.status(400).json({
        error: 'Invalid or expired FCM token',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Failed to send notification',
      details: error.message
    });
  }
});

export default router;

