import express from 'express';
import prisma from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createActivityLog } from '../utils/utils/activityLogger';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

// Get all bookings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, requestType } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (requestType) {
      where.requestType = requestType;
    }

    const bookings = await prisma.bookingRequest.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            courseType: true,
          },
        },
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        client: {
          select: {
            id: true,
            userName: true,
            companyEmail: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ bookings });
  } catch (error: any) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings', details: error.message });
  }
});

// Get conflicting bookings (APPROVED but not CONFIRMED on same date)
router.get('/:id/conflicting', async (req: AuthRequest, res) => {
  try {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!booking || !booking.trainerId || !booking.requestedDate) {
      return res.json({ conflictingBookings: [] });
    }

    // Get bookings on the same date that are APPROVED but not CONFIRMED
    const conflictingBookings = await prisma.bookingRequest.findMany({
      where: {
        trainerId: booking.trainerId,
        requestedDate: booking.requestedDate,
        status: 'APPROVED',
        id: { not: booking.id }, // Exclude current booking
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
        client: {
          select: {
            id: true,
            userName: true,
            companyEmail: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // Show older bookings first
    });

    return res.json({ conflictingBookings });
  } catch (error: any) {
    console.error('Get conflicting bookings error:', error);
    return res.status(500).json({ error: 'Failed to fetch conflicting bookings', details: error.message });
  }
});

// Send email to multiple clients
router.post('/send-email', async (req: AuthRequest, res) => {
  try {
    const { clientIds, title, message } = req.body;

    if (!Array.isArray(clientIds) || clientIds.length === 0 || !title || !message) {
      return res.status(400).json({ error: 'clientIds (array), title, and message are required' });
    }

    // Create notifications for all clients
    const notifications = await Promise.all(
      clientIds.map((clientId: string) =>
        prisma.notification.create({
          data: {
            userId: clientId,
            title,
            message,
            type: 'INFO',
            relatedEntityType: 'booking_request',
          },
        }).catch(() => null) // Ignore errors for individual notifications
      )
    );

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'CREATE',
      entityType: 'booking_request',
      description: `Sent email to ${clientIds.length} client(s)`,
      metadata: { title, clientCount: clientIds.length },
    });

    return res.json({ 
      message: `Email sent to ${notifications.filter(n => n !== null).length} client(s)`,
      sentCount: notifications.filter(n => n !== null).length,
    });
  } catch (error: any) {
    console.error('Send email error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Confirm booking
router.put('/:id/confirm', async (req: AuthRequest, res) => {
  try {
    const { totalSlots, registeredParticipants, availabilityIds } = req.body;
    // totalSlots: Total number of people who can attend (sets maxPacks for the event)
    // registeredParticipants: Number of people registered now through this request (creates registrations)
    // availabilityIds: Required - Array of trainer availability IDs to use for the event dates (standardized)

    if (!totalSlots || parseInt(String(totalSlots)) < 1) {
      return res.status(400).json({ error: 'Total slots is required and must be at least 1' });
    }

    if (!registeredParticipants || parseInt(String(registeredParticipants)) < 1) {
      return res.status(400).json({ error: 'Registered participants is required and must be at least 1' });
    }

    if (!availabilityIds || !Array.isArray(availabilityIds) || availabilityIds.length === 0) {
      return res.status(400).json({ error: 'At least one trainer availability ID is required. Please select date(s) from trainer availability calendar.' });
    }

    const totalSlotsNum = parseInt(String(totalSlots));
    const registeredParticipantsNum = parseInt(String(registeredParticipants));

    if (registeredParticipantsNum > totalSlotsNum) {
      return res.status(400).json({ error: 'Registered participants cannot exceed total slots' });
    }

    const booking = await prisma.bookingRequest.findUnique({
      where: { id: req.params.id },
      include: {
        course: true,
        trainer: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!booking.courseId) {
      return res.status(400).json({ error: 'Booking must have an associated course' });
    }

    if (!booking.trainerId) {
      return res.status(400).json({ error: 'Booking must have an assigned trainer' });
    }

    // Fetch all selected availability records
    const availabilities = await prisma.trainerAvailability.findMany({
      where: { id: { in: availabilityIds } },
      orderBy: { date: 'asc' },
    });

    if (availabilities.length !== availabilityIds.length) {
      return res.status(404).json({ error: 'One or more trainer availability records not found' });
    }

    // Validate all availabilities belong to the booking's trainer and are available
    for (const availability of availabilities) {
      if (availability.trainerId !== booking.trainerId) {
        return res.status(400).json({ error: 'One or more availability records do not belong to the assigned trainer' });
      }
      if (availability.status !== 'AVAILABLE' && availability.status !== 'TENTATIVE') {
        return res.status(400).json({ error: `One or more selected dates are not available. Current status: ${availability.status}` });
      }
    }

    // Use first date as eventDate, last date as endDate
    const finalEventDate = new Date(availabilities[0].date);
    const lastDate = availabilities.length > 1 ? new Date(availabilities[availabilities.length - 1].date) : null;

    const course = booking.course;
    if (!course) {
      return res.status(400).json({ error: 'Booking must have an associated course' });
    }

    // Standardized: Check for duplicate events before creating
    const existingEvent = await prisma.event.findFirst({
      where: {
        courseId: course.id,
        eventDate: finalEventDate,
      },
    });

    if (existingEvent) {
      return res.status(400).json({ error: 'Event already exists for this course and date' });
    }

    // Update booking status and store first availability ID for tracking
    const updated = await prisma.bookingRequest.update({
      where: { id: req.params.id },
      data: { 
        status: 'CONFIRMED',
        trainerAvailabilityId: availabilityIds[0], // Store first availability ID for tracking
      },
    });

    // Mark all selected availability records as BOOKED
    try {
      await prisma.trainerAvailability.updateMany({
        where: { id: { in: availabilityIds } },
        data: { status: 'BOOKED' },
      });

      console.log(`[Booking Confirmation] Marked ${availabilityIds.length} date(s) as BOOKED for trainer ${booking.trainerId}`);
    } catch (error: any) {
      console.error('Error updating trainer availability status:', error);
      // Continue even if update fails, but log error
    }

    // Create Event from the confirmed booking
    if (course) {
      const startDate = finalEventDate;
      // Use last selected date as endDate (if multiple dates), otherwise null
      const endDate = lastDate;

      // Generate event code
      const eventCode = `EVT-${Date.now().toString(36).toUpperCase()}`;

      // Standardized: Handle courseMode as array (consistent with course event creation)
      let courseModeArray: string[] = [];
      if (course.courseMode) {
        if (Array.isArray(course.courseMode)) {
          courseModeArray = course.courseMode as string[];
        } else if (typeof course.courseMode === 'string') {
          try {
            const parsed = JSON.parse(course.courseMode);
            courseModeArray = Array.isArray(parsed) ? (parsed as string[]) : [parsed as string];
          } catch {
            courseModeArray = [course.courseMode];
          }
        } else {
          courseModeArray = [String(course.courseMode)];
        }
      }
      // Default to PHYSICAL if no mode specified
      if (courseModeArray.length === 0) {
        courseModeArray = ['PHYSICAL'];
      }

      // For both In-House and Public: totalSlots sets maxPacks
      // For In-House: maxPacks can be set to totalSlots (capacity), but registrations are still created
      // For Public: maxPacks = totalSlots (available slots for registration)
      const event = await prisma.event.create({
        data: {
          courseId: course.id,
          trainerId: booking.trainerId || null,
          createdBy: req.user!.id,
          eventCode: eventCode,
          title: course.title || `Event: ${course.title}`,
          description: course.description || null,
          learningObjectives: course.learningObjectives ?? undefined,
          learningOutcomes: course.learningOutcomes ?? undefined,
          targetAudience: course.targetAudience || null,
          methodology: course.methodology || null,
          prerequisite: course.prerequisite || null,
          certificate: course.certificate || null,
          assessment: course.assessment || false,
          courseType: booking.requestType === 'PUBLIC' ? ['PUBLIC'] : ['IN_HOUSE'], // Standardized: Store as array
          courseMode: courseModeArray, // Standardized: Always use array format
          durationHours: course.durationHours || 0,
          durationUnit: course.durationUnit || 'hours',
          modules: course.modules || [],
          venue: booking.location || course.venue || null,
          price: course.price || null,
          eventDate: finalEventDate, // Standardized: Always use date from availability
          startDate: startDate,
          endDate: endDate,
          category: course.category || null,
          city: booking.city || course.city || null,
          state: booking.state || course.state || null,
          hrdcClaimable: course.hrdcClaimable || false,
          courseSequence: course.courseSequence || null,
          status: 'ACTIVE',
          // For both types: maxPacks = totalSlots (total capacity)
          maxPacks: totalSlotsNum,
        },
      });

      // For both In-House and Public: Create a single registration with number of participants
      // Since admin already confirmed these participants during booking confirmation,
      // they should be created as APPROVED (no need for admin to approve again)
      if (registeredParticipantsNum > 0 && booking.clientId) {
        // Create a single registration with the number of participants
        // Use 'APPROVED' status since admin already confirmed them during booking confirmation
        await prisma.eventRegistration.create({
          data: {
            eventId: event.id,
            clientId: booking.clientId,
            clientName: booking.clientName || null,
            clientEmail: booking.clientEmail || null,
            numberOfParticipants: registeredParticipantsNum,
            status: 'APPROVED', // Already approved by admin during booking confirmation
          },
        });
        // Note: maxPacks is set to totalSlotsNum
        // The registeredParticipantsNum participants consume that many slots
        // Available slots = totalSlotsNum - registeredParticipantsNum
        // For Public: Other clients can register for remaining slots
        // For In-House: Remaining slots may be used for additional participants from the same company
      }

      // Create notification
      if (booking.clientId) {
        await prisma.notification.create({
          data: {
            userId: booking.clientId,
            title: 'Booking Confirmed',
            message: `Booking for ${booking.requestedDate} has been confirmed and an event has been created.`,
            type: 'SUCCESS',
            relatedEntityType: 'booking',
            relatedEntityId: booking.id,
          },
        });
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CONFIRM',
        entityType: 'booking',
        entityId: booking.id,
        description: `Confirmed booking for ${booking.clientName} and created event ${eventCode}`,
        metadata: { eventId: event.id, totalSlots: totalSlotsNum, registeredParticipants: registeredParticipantsNum },
      });

      return res.json({ 
        message: 'Booking confirmed successfully and event created', 
        booking: updated,
        event,
      });
    } else {
      // Fallback if no course (shouldn't happen but handle gracefully)
      if (booking.clientId) {
        await prisma.notification.create({
          data: {
            userId: booking.clientId,
            title: 'Booking Confirmed',
            message: `Booking for ${booking.requestedDate} has been confirmed.`,
            type: 'SUCCESS',
            relatedEntityType: 'booking',
            relatedEntityId: booking.id,
          },
        });
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CONFIRM',
        entityType: 'booking',
        entityId: booking.id,
        description: `Confirmed booking for ${booking.clientName}`,
      });

      return res.json({ message: 'Booking confirmed successfully', booking: updated });
    }
  } catch (error: any) {
    console.error('Confirm booking error:', error);
    return res.status(500).json({ error: 'Failed to confirm booking', details: error.message });
  }
});

// Cancel booking
router.put('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });

    // Create notification
    if (booking.clientId) {
      await prisma.notification.create({
        data: {
          userId: booking.clientId,
          title: 'Booking Cancelled',
          message: 'A booking has been cancelled.',
          type: 'WARNING',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
        },
      });
    }

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'CANCEL',
      entityType: 'booking',
      entityId: booking.id,
      description: `Cancelled booking for ${booking.clientName}`,
    });

    return res.json({ message: 'Booking cancelled successfully', booking: updated });
  } catch (error: any) {
    console.error('Cancel booking error:', error);
    return res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
  }
});

export default router;

