import express, { Response } from 'express';
import prisma from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { createActivityLog } from '../utils/utils/activityLogger';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

// Get all event registrations (for Book Now tab)
router.get('/registrations', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, trainerId, eventId } = req.query;

    const where: any = {};
    if (courseId) {
      where.event = { courseId: courseId as string };
    }
    if (trainerId) {
      where.event = { ...where.event, trainerId: trainerId as string };
    }
    if (eventId) {
      where.eventId = eventId as string;
    }

    const registrations = await prisma.eventRegistration.findMany({
      where,
      include: {
        event: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              },
            },
            trainer: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            userName: true,
            companyEmail: true,
            contactNumber: true,
          },
        },
      },
      orderBy: [
        { event: { eventDate: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    return res.json({ registrations });
  } catch (error: any) {
    console.error('Get event registrations error:', error);
    return res.status(500).json({ error: 'Failed to fetch event registrations', details: error.message });
  }
});

// Approve event registration (create registrations for number of participants)
router.put(
  '/registrations/:id/approve',
  [
    body('numberOfParticipants').isInt({ min: 1 }).withMessage('Number of participants must be a positive integer'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { numberOfParticipants } = req.body;
      const participantsNum = parseInt(String(numberOfParticipants));

      const registration = await prisma.eventRegistration.findUnique({
        where: { id: req.params.id },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              maxPacks: true,
              _count: {
                select: {
                  registrations: {
                    where: {
                      status: {
                        in: ['REGISTERED', 'APPROVED'], // Count both as they consume slots
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!registration) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      // Calculate total participants already registered (sum of numberOfParticipants)
      // Exclude the current registration being approved to avoid double-counting
      const existingRegistrations = await prisma.eventRegistration.findMany({
        where: {
          eventId: registration.eventId,
          status: {
            in: ['REGISTERED', 'APPROVED'],
          },
          id: {
            not: registration.id, // Exclude the current registration
          },
        },
        select: {
          numberOfParticipants: true,
        },
      });

      const currentParticipants = existingRegistrations.reduce(
        (sum, reg) => sum + (reg.numberOfParticipants || 1), 
        0
      );

      // Get the current registration's participant count (before update)
      const currentRegistrationParticipants = registration.numberOfParticipants || 1;

      // Calculate total participants after approval: existing + new count (replacing old count)
      const totalAfterApproval = currentParticipants - currentRegistrationParticipants + participantsNum;

      // Check if there are enough slots available
      if (registration.event.maxPacks && totalAfterApproval > registration.event.maxPacks) {
        const availableSlots = registration.event.maxPacks - currentParticipants;
        return res.status(400).json({ 
          error: `Not enough slots available. Requested: ${participantsNum}, Available: ${availableSlots + currentRegistrationParticipants}` 
        });
      }

      // Update the existing registration with number of participants
      const updated = await prisma.eventRegistration.update({
        where: { id: req.params.id },
        data: {
          status: 'APPROVED',
          numberOfParticipants: participantsNum,
        },
      });

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'UPDATE',
        entityType: 'event_registration',
        entityId: registration.id,
        description: `Approved ${participantsNum} participant(s) from ${registration.clientName || 'company'} for event: ${registration.event.title}`,
      });

      return res.json({ 
        registration: updated,
        message: `Successfully approved ${participantsNum} participant(s) for this company` 
      });
    } catch (error: any) {
      console.error('Approve registration error:', error);
      return res.status(500).json({ 
        error: 'Failed to approve registration', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// Cancel event registration
router.put('/registrations/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const registration = await prisma.eventRegistration.findUnique({
      where: { id: req.params.id },
      include: {
        event: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const updated = await prisma.eventRegistration.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'UPDATE',
      entityType: 'event_registration',
      entityId: registration.id,
      description: `Cancelled registration for event: ${registration.event.title}`,
    });

    return res.json({ registration: updated, message: 'Registration cancelled successfully' });
  } catch (error: any) {
    console.error('Cancel registration error:', error);
    return res.status(500).json({ error: 'Failed to cancel registration', details: error.message });
  }
});

// Update event status
router.put(
  '/:id/status',
  [
    body('status')
      .isIn(['ACTIVE', 'COMPLETED', 'CANCELLED'])
      .withMessage('Invalid event status. Events can only be ACTIVE, COMPLETED, or CANCELLED'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status } = req.body;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              title: true,
            },
          },
        },
      });

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const updated = await prisma.event.update({
        where: { id },
        data: { status },
        include: {
          trainer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
            },
          },
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });

      // If event status is changed to CANCELLED, update trainer availability to AVAILABLE for all event dates
      if (status === 'CANCELLED' && event.trainerId && event.eventDate) {
        try {
          const startDate = new Date(event.eventDate);
          startDate.setHours(0, 0, 0, 0);
          
          // Determine end date - use event.endDate if available, otherwise just the start date
          let endDate = updated.endDate ? new Date(updated.endDate) : new Date(startDate);
          endDate.setHours(23, 59, 59, 999);

          // Find all BOOKED availability records for the trainer within the event date range
          const availabilities = await prisma.trainerAvailability.findMany({
            where: {
              trainerId: event.trainerId,
              date: {
                gte: startDate,
                lte: endDate,
              },
              status: 'BOOKED',
            },
          });

          // Update all found availability records to AVAILABLE
          for (const availability of availabilities) {
            await prisma.trainerAvailability.update({
              where: { id: availability.id },
              data: { status: 'AVAILABLE' },
            });
          }

          if (availabilities.length > 0) {
            console.log(`Updated ${availabilities.length} trainer availability record(s) to AVAILABLE for trainer ${event.trainerId} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
          } else {
            // If no availability records found, create one for the start date as AVAILABLE
            await prisma.trainerAvailability.create({
              data: {
                trainerId: event.trainerId,
                date: startDate,
                status: 'AVAILABLE',
              },
            });
            console.log(`Created AVAILABLE availability for trainer ${event.trainerId} on ${startDate.toISOString().split('T')[0]}`);
          }
        } catch (availabilityError) {
          // Log error but don't fail the request
          console.error('Error updating trainer availability when cancelling event:', availabilityError);
        }
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'UPDATE',
        entityType: 'event',
        entityId: event.id,
        description: `Updated event status to ${status} for: ${event.title || event.course?.title || 'Event'}`,
      });

      return res.json({ event: updated, message: `Event status updated to ${status}` });
    } catch (error: any) {
      console.error('Update event status error:', error);
      return res.status(500).json({ error: 'Failed to update event status', details: error.message });
    }
  }
);

// Auto-complete past events (mark ACTIVE events as COMPLETED if past their end date)
router.post('/auto-complete-past', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all ACTIVE events that have passed their end date (or eventDate if no endDate)
    const pastEvents = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          {
            endDate: {
              lt: today,
            },
          },
          {
            AND: [
              { endDate: null },
              { eventDate: { lt: today } },
            ],
          },
        ],
      },
      include: {
        course: {
          select: {
            title: true,
          },
        },
      },
    });

    const updatedEvents = [];
    for (const event of pastEvents) {
      const updated = await prisma.event.update({
        where: { id: event.id },
        data: { status: 'COMPLETED' },
      });

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'UPDATE',
        entityType: 'event',
        entityId: event.id,
        description: `Auto-completed event (past end date): ${event.title || event.course?.title || 'Event'}`,
      });

      updatedEvents.push(updated);
    }

    return res.json({
      message: `Auto-completed ${updatedEvents.length} past event(s)`,
      count: updatedEvents.length,
      events: updatedEvents,
    });
  } catch (error: any) {
    console.error('Auto-complete past events error:', error);
    return res.status(500).json({ error: 'Failed to auto-complete past events', details: error.message });
  }
});

export default router;

