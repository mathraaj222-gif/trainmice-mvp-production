import express, { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { body, validationResult } from 'express-validator';
import { createActivityLog } from '../utils/utils/activityLogger';

const router = express.Router();

// Optional authentication middleware - doesn't fail if no token, but sets req.user if token is valid
const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, config.jwt.secret) as {
          userId: string;
          email: string;
          role: string;
        };

        // Verify user still exists
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
          },
        });

        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
        }
      } catch (tokenError) {
        // Invalid token, continue without authentication (for public access)
      }
    }
    // No token or invalid token, continue without authentication
    next();
  } catch (error) {
    // If any error occurs, continue without authentication (for public access)
    next();
  }
};

// Get all events (public access when querying by courseId, authenticated for trainer/admin)
router.get('/', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { trainerId, courseId, status } = req.query;
    
    // Require authentication if trainerId is provided (trainer/admin only)
    if (trainerId && !req.user) {
      return res.status(401).json({ error: 'Authentication required to view trainer events' });
    }
    
    // If trainerId is provided and user is authenticated, verify they can view these events
    if (trainerId && req.user) {
      // Trainers can only view their own events (admins can view all)
      if (req.user.role !== 'ADMIN' && req.user.id !== trainerId) {
        return res.status(403).json({ error: 'Not authorized to view events for this trainer' });
      }
    }

    const where: any = {};
    
    // If trainerId is provided, check both direct trainerId and CourseTrainer assignments
    if (trainerId) {
      // Get courses where this trainer is assigned via CourseTrainer
      const assignedCourses = await prisma.courseTrainer.findMany({
        where: { trainerId: trainerId as string },
        select: { courseId: true },
      });
      const assignedCourseIds = assignedCourses.map(ct => ct.courseId);

      // Events where trainerId matches OR course is assigned to trainer via CourseTrainer
      const trainerFilter: any = {
        OR: [
          { trainerId: trainerId as string },
          ...(assignedCourseIds.length > 0 ? [{ courseId: { in: assignedCourseIds } }] : []),
        ],
      };
      
      // Combine with other filters
      if (courseId || status) {
        where.AND = [trainerFilter];
        if (courseId) {
          where.AND.push({ courseId: courseId as string });
        }
        if (status) {
          where.AND.push({ status: status as string });
        }
      } else {
        Object.assign(where, trainerFilter);
      }
    } else {
      // No trainerId filter, just apply courseId and status
      if (courseId) {
        where.courseId = courseId;
      }
      if (status) {
        where.status = status;
      }
    }

    const events = await prisma.event.findMany({
      where,
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
        registrations: {
          where: {
            status: {
              in: ['REGISTERED', 'APPROVED'],
            },
          },
          include: {
            client: {
              select: {
                id: true,
                userName: true,
                companyEmail: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            registrations: {
              where: {
                status: {
                  in: ['REGISTERED', 'APPROVED'],
                },
              },
            },
          },
        },
      },
      orderBy: { eventDate: 'asc' },
    });

    // Calculate total participants for each event (sum of numberOfParticipants)
    const eventsWithParticipants = events.map(event => {
      const totalParticipants = event.registrations.reduce(
        (sum, reg) => sum + (reg.numberOfParticipants || 1),
        0
      );
      return {
        ...event,
        totalParticipants, // Add total participants count
      };
    });

    return res.json({ events: eventsWithParticipants });
  } catch (error: any) {
    console.error('Get events error:', error);
    return res.status(500).json({ error: 'Failed to fetch events', details: error.message });
  }
});

// Get single event
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
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
        registrations: {
          include: {
            client: {
              select: {
                id: true,
                userName: true,
                companyEmail: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.json({ event });
  } catch (error: any) {
    console.error('Get event error:', error);
    return res.status(500).json({ error: 'Failed to fetch event', details: error.message });
  }
});

// Register for event (Book Now - fixed date course registration)
router.post(
  '/:id/register',
  authenticate,
  [
    body('clientName').optional().trim(),
    body('clientEmail').optional().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const event = await prisma.event.findUnique({
        where: { id: req.params.id },
      });

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Calculate total participants (sum of numberOfParticipants from all approved/registered)
      const existingRegistrations = await prisma.eventRegistration.findMany({
        where: {
          eventId: event.id,
          status: {
            in: ['REGISTERED', 'APPROVED'],
          },
        },
        select: {
          numberOfParticipants: true,
        },
      });

      const totalParticipants = existingRegistrations.reduce(
        (sum, reg) => sum + (reg.numberOfParticipants || 1),
        0
      );

      // Check if event is full
      if (event.maxPacks && totalParticipants >= event.maxPacks) {
        return res.status(400).json({ error: 'Event is full. No more slots available.' });
      }

      // Determine client ID
      const clientId = req.user!.role === 'CLIENT' ? req.user!.id : req.body.clientId || null;

      const registration = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          clientId,
          clientName: req.body.clientName || null,
          clientEmail: req.body.clientEmail || null,
          numberOfParticipants: 1, // Default to 1, admin will update during approval
          status: 'REGISTERED',
        },
        include: {
          client: {
            select: {
              id: true,
              userName: true,
              companyEmail: true,
            },
          },
          event: {
            select: {
              title: true,
              eventDate: true,
            },
          },
        },
      });

      // Create notification for trainer
      if (event.trainerId) {
        await prisma.notification.create({
          data: {
            userId: event.trainerId,
            title: 'New Event Registration',
            message: `A new registration has been made for "${event.title}" on ${event.eventDate.toLocaleDateString()}.`,
            type: 'INFO',
            relatedEntityType: 'event',
            relatedEntityId: event.id,
          },
        }).catch(() => {});
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CREATE',
        entityType: 'event_registration',
        entityId: registration.id,
        description: `Registered for event: ${event.title}`,
      });

      return res.status(201).json({ registration, message: 'Successfully registered for event' });
    } catch (error: any) {
      console.error('Register for event error:', error);
      return res.status(500).json({ error: 'Failed to register for event', details: error.message });
    }
  }
);

// Create event from course (for courses with fixed_date)
router.post(
  '/create-from-course',
  authenticate,
  [body('courseId').notEmpty().trim()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { courseId } = req.body;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (!course.fixedDate) {
        return res.status(400).json({ error: 'Course does not have a fixed date' });
      }

      // Check if event already exists
      const existingEvent = await prisma.event.findFirst({
        where: {
          courseId: course.id,
          eventDate: course.fixedDate,
        },
      });

      if (existingEvent) {
        return res.json({ event: existingEvent, message: 'Event already exists' });
      }

      // Create event from course
      const event = await prisma.event.create({
        data: {
          courseId: course.id,
          trainerId: course.trainerId,
          createdBy: course.createdBy,
          title: course.title,
          description: course.description,
          learningObjectives: course.learningObjectives ?? undefined,
          learningOutcomes: course.learningOutcomes ?? undefined,
          targetAudience: course.targetAudience,
          methodology: course.methodology,
          prerequisite: course.prerequisite,
          certificate: course.certificate,
          assessment: course.assessment,
          courseType: course.courseType ?? undefined,
          durationHours: course.durationHours,
          durationUnit: course.durationUnit,
          modules: course.modules ?? undefined,
          venue: course.venue,
          price: course.price,
          eventDate: course.fixedDate,
          startDate: course.startDate,
          endDate: course.endDate,
          category: course.category,
          city: course.city,
          state: course.state,
          hrdcClaimable: course.hrdcClaimable,
          brochureUrl: course.brochureUrl,
          courseSequence: course.courseSequence,
          status: 'ACTIVE', // Events always start as ACTIVE, regardless of course status
          maxPacks: null,
        },
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

      return res.status(201).json({ event, message: 'Event created successfully' });
    } catch (error: any) {
      console.error('Create event from course error:', error);
      return res.status(500).json({ error: 'Failed to create event', details: error.message });
    }
  }
);

// Register from course (creates event if needed)
router.post(
  '/register-from-course',
  authenticate,
  [
    body('courseId').notEmpty().trim(),
    body('clientName').optional().trim(),
    body('clientEmail').optional().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { courseId, clientName, clientEmail } = req.body;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (!course.fixedDate) {
        return res.status(400).json({ error: 'Course does not have a fixed date' });
      }

      // Find or create event
      let event = await prisma.event.findFirst({
        where: {
          courseId: course.id,
          eventDate: course.fixedDate,
        },
        include: {
          _count: {
            select: {
              registrations: {
                where: {
                  status: {
                    in: ['REGISTERED', 'APPROVED'], // Count both REGISTERED and APPROVED as they consume slots
                  },
                },
              },
            },
          },
        },
      });

      if (!event) {
        // Create event from course
        const newEvent = await prisma.event.create({
          data: {
            courseId: course.id,
            trainerId: course.trainerId,
            createdBy: course.createdBy,
            title: course.title,
            description: course.description,
            learningObjectives: course.learningObjectives ?? undefined,
            learningOutcomes: course.learningOutcomes ?? undefined,
            targetAudience: course.targetAudience,
            methodology: course.methodology,
            prerequisite: course.prerequisite,
            certificate: course.certificate,
            assessment: course.assessment,
            courseType: course.courseType ?? undefined,
            durationHours: course.durationHours,
            durationUnit: course.durationUnit,
            modules: course.modules ?? undefined,
            venue: course.venue,
            price: course.price,
            eventDate: course.fixedDate,
            startDate: course.startDate,
            endDate: course.endDate,
            category: course.category,
            city: course.city,
            state: course.state,
            hrdcClaimable: course.hrdcClaimable,
            brochureUrl: course.brochureUrl,
            courseSequence: course.courseSequence,
            status: 'ACTIVE', // Events always start as ACTIVE, regardless of course status
            maxPacks: null,
          },
        });
        
        // Refetch event with _count
        event = await prisma.event.findUnique({
          where: { id: newEvent.id },
          include: {
            _count: {
              select: {
                registrations: {
                  where: {
                    status: 'REGISTERED',
                  },
                },
              },
            },
          },
        });
      }

      // Check if event is full
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.maxPacks && event._count && event._count.registrations >= event.maxPacks) {
        return res.status(400).json({ error: 'Event is full. No more packs available.' });
      }

      // Determine client ID
      const clientId = req.user!.role === 'CLIENT' ? req.user!.id : req.body.clientId || null;

      const registration = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          clientId,
          clientName: clientName || null,
          clientEmail: clientEmail || null,
          numberOfParticipants: 1, // Default to 1, admin will update during approval
          status: 'REGISTERED',
        },
        include: {
          client: {
            select: {
              id: true,
              userName: true,
              companyEmail: true,
            },
          },
          event: {
            select: {
              title: true,
              eventDate: true,
            },
          },
        },
      });

      // Create notification for trainer
      if (event.trainerId) {
        await prisma.notification.create({
          data: {
            userId: event.trainerId,
            title: 'New Event Registration',
            message: `A new registration has been made for "${event.title}" on ${event.eventDate.toLocaleDateString()}.`,
            type: 'INFO',
            relatedEntityType: 'event',
            relatedEntityId: event.id,
          },
        }).catch(() => {});
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CREATE',
        entityType: 'event_registration',
        entityId: registration.id,
        description: `Registered for event: ${event.title}`,
      });

      return res.status(201).json({ registration, message: 'Successfully registered for event' });
    } catch (error: any) {
      console.error('Register from course error:', error);
      return res.status(500).json({ error: 'Failed to register for event', details: error.message });
    }
  }
);

// Get event registrations
router.get('/:id/registrations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId: req.params.id },
      include: {
        client: {
          select: {
            id: true,
            userName: true,
            companyEmail: true,
            contactNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ registrations });
  } catch (error: any) {
    console.error('Get event registrations error:', error);
    return res.status(500).json({ error: 'Failed to fetch registrations', details: error.message });
  }
});

// Update event status (trainer can update their own events)
router.put(
  '/:id/status',
  authenticate,
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

      // Trainers can only update their own events
      if (req.user!.role === 'TRAINER' && event.trainerId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to update this event' });
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

export default router;

