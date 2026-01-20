import express, { Response } from 'express';
import prisma from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { createActivityLog } from '../utils/utils/activityLogger';
import { generateCourseCode } from '../utils/utils/sequentialId';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

// Helper function to validate and normalize courseType array
function normalizeCourseType(courseType: any): string[] {
  if (!courseType) return [];
  if (Array.isArray(courseType)) {
    // Filter out empty strings, null, undefined, and invalid values
    return courseType
      .filter(t => t && typeof t === 'string' && t.trim() !== '')
      .map(t => String(t).toUpperCase().trim())
      .filter(t => ['IN_HOUSE', 'PUBLIC'].includes(t));
  }
  // Handle single value case
  if (typeof courseType === 'string') {
    const normalized = courseType.toUpperCase().trim();
    if (['IN_HOUSE', 'PUBLIC'].includes(normalized)) {
      return [normalized];
    }
  }
  return [];
}

// Helper function to validate and normalize courseMode array
function normalizeCourseMode(courseMode: any): string[] {
  if (!courseMode) return ['PHYSICAL'];
  if (Array.isArray(courseMode)) {
    // Map VIRTUAL to ONLINE and BOTH to HYBRID
    return courseMode
      .map((m: string) => {
        if (m === 'VIRTUAL') return 'ONLINE';
        if (m === 'BOTH') return 'HYBRID';
        return m;
      })
      .filter((m: string) => ['PHYSICAL', 'ONLINE', 'HYBRID'].includes(m));
  }
  // Handle single value case
  if (courseMode === 'VIRTUAL') return ['ONLINE'];
  if (courseMode === 'BOTH') return ['HYBRID'];
  if (['PHYSICAL', 'ONLINE', 'HYBRID'].includes(courseMode)) {
    return [courseMode];
  }
  return ['PHYSICAL'];
}

// Get all courses (admin view)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, pendingOnly } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    // Default to showing pending approval courses if pendingOnly is true
    if (pendingOnly === 'true') {
      where.status = 'PENDING_APPROVAL';
    }
    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }
    // For admin, show all courses by default (don't filter by status unless specified)

    const courses = await prisma.course.findMany({
      where,
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        courseTrainers: {
          include: {
            trainer: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        courseMaterials: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            uploadedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ courses });
  } catch (error: any) {
    console.error('Get courses error:', error);
    return res.status(500).json({ error: 'Failed to fetch courses', details: error.message });
  }
});

// Get single course (admin view)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        courseTrainers: {
          include: {
            trainer: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        courseMaterials: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            uploadedAt: true,
          },
        },
        courseSchedule: {
          orderBy: [
            { dayNumber: 'asc' },
            { startTime: 'asc' },
          ],
          select: {
            id: true,
            dayNumber: true,
            startTime: true,
            endTime: true,
            moduleTitle: true,
            submoduleTitle: true,
            durationMinutes: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    return res.json({ course });
  } catch (error: any) {
    console.error('Get course error:', error);
    return res.status(500).json({ error: 'Failed to fetch course', details: error.message });
  }
});

// Create course (admin)
router.post(
  '/',
  [
    body('title').notEmpty().trim(),
    body('description').optional().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    console.log('POST /admin/courses - Create course route hit');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updateData: any = {};
      // Admins can edit all fields when reviewing courses, including trainer-filled fields
      const allowedFields = [
        'title', 'description', 'courseType', 'courseMode', 'trainerId', 'durationHours',
        'durationUnit', 'price', 'venue', 'startDate', 'endDate', 'fixedDate', 'status',
        'category', 'certificate', 'assessment', 'learningObjectives', 'learningOutcomes',
        'targetAudience', 'methodology', 'prerequisite', 'hrdcClaimable', 'brochureUrl',
        'city', 'state', 'courseSequence', 'courseCode', 'modules',
        'professionalDevelopmentPoints', 'professionalDevelopmentPointsOther',
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'startDate' || field === 'endDate' || field === 'fixedDate') {
            updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else if (field === 'durationHours') {
            // durationHours is Int in database, so parse as integer
            updateData[field] = req.body[field] ? Math.round(parseFloat(req.body[field])) : null;
          } else if (field === 'price') {
            updateData[field] = req.body[field] ? parseFloat(req.body[field]) : null;
          } else if (field === 'learningObjectives' || field === 'learningOutcomes' || field === 'modules') {
            // Handle JSON arrays
            updateData[field] = req.body[field] ? (Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]]) : null;
          } else if (field === 'courseType') {
            // Normalize courseType to array
            const normalized = normalizeCourseType(req.body[field]);
            if (normalized.length === 0 && req.body[field] !== null) {
              throw new Error('Invalid courseType. Must be an array containing IN_HOUSE and/or PUBLIC');
            }
            updateData[field] = normalized.length > 0 ? normalized : null;
          } else if (field === 'courseMode') {
            // Normalize courseMode to array
            const normalized = normalizeCourseMode(req.body[field]);
            if (normalized.length === 0 && req.body[field] !== null) {
              throw new Error('Invalid courseMode. Must be an array containing PHYSICAL, ONLINE, and/or HYBRID');
            }
            updateData[field] = normalized.length > 0 ? normalized : null;
          } else if (field === 'courseSequence') {
            updateData[field] = req.body[field] ? parseInt(req.body[field]) : null;
          } else if (field === 'courseCode') {
            // Allow courseCode to be set or cleared (empty string becomes null)
            updateData[field] = req.body[field] && req.body[field].trim() !== '' ? req.body[field].trim() : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      });

      // Extract trainerAvailabilityId (not a course field)
      const { trainerAvailabilityId, trainerIds } = req.body;

      // Set default values
      if (!updateData.status) {
        updateData.status = 'DRAFT';
      }
      updateData.createdByAdmin = true;
      updateData.createdBy = req.user!.id;

      // Generate course code if not provided
      // For admin-created courses, use 'ADMIN' as creator code
      if (!updateData.courseCode) {
        const adminUser = await prisma.admin.findUnique({
          where: { id: req.user!.id },
          select: { adminCode: true },
        });
        const creatorCode = adminUser?.adminCode || 'ADMIN';
        updateData.courseCode = await generateCourseCode(creatorCode);
      }

      // Handle trainer assignments for admin-created courses
      if (trainerIds && Array.isArray(trainerIds) && trainerIds.length > 0) {
        // Set the first trainer as the primary trainer_id
        updateData.trainerId = trainerIds[0];
      } else if (updateData.trainerId) {
        // Single trainer assignment - already set in updateData
      }

      const course = await prisma.course.create({
        data: updateData,
      });

      // Handle multiple trainer assignments via CourseTrainer table
      if (trainerIds && Array.isArray(trainerIds) && trainerIds.length > 0) {
        await prisma.courseTrainer.createMany({
          data: trainerIds.map((trainerId: string) => ({
            courseId: course.id,
            trainerId: trainerId,
          })),
        });
      }

      // Handle trainer availability if provided
      if (trainerAvailabilityId && course.fixedDate) {
        try {
          await prisma.trainerAvailability.update({
            where: { id: trainerAvailabilityId },
            data: { status: 'BOOKED' },
          });
        } catch (err) {
          console.error('Error updating trainer availability:', err);
          // Don't fail the course creation if availability update fails
        }
      }

      // Events are now created manually by admin using the Create Event form
      // Removed automatic event sync - admin will create events separately

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CREATE',
        entityType: 'course',
        entityId: course.id,
        description: `Created course: ${course.title}`,
      });

      return res.status(201).json({ course });
    } catch (error: any) {
      console.error('Create course error:', error);
      return res.status(500).json({ error: 'Failed to create course', details: error.message });
    }
  }
);

// Update course (admin)
router.put(
  '/:id',
  [
    body('title').optional().trim(),
    body('description').optional().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('Update course request body:', JSON.stringify(req.body, null, 2));
      console.log('Course ID:', req.params.id);

      const updateData: any = {};
      // Admins can edit all fields when reviewing courses, including trainer-filled fields
      const allowedFields = [
        'title', 'description', 'courseType', 'courseMode', 'trainerId', 'durationHours',
        'durationUnit', 'price', 'venue', 'startDate', 'endDate', 'fixedDate', 'status',
        'category', 'certificate', 'assessment', 'learningObjectives', 'learningOutcomes',
        'targetAudience', 'methodology', 'prerequisite', 'hrdcClaimable', 'brochureUrl',
        'city', 'state', 'courseSequence', 'courseCode', 'modules',
        'professionalDevelopmentPoints', 'professionalDevelopmentPointsOther',
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'startDate' || field === 'endDate' || field === 'fixedDate') {
            updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else if (field === 'durationHours') {
            // durationHours is Int in database, so parse as integer
            updateData[field] = req.body[field] ? Math.round(parseFloat(req.body[field])) : null;
          } else if (field === 'price') {
            updateData[field] = req.body[field] ? parseFloat(req.body[field]) : null;
          } else if (field === 'learningObjectives' || field === 'learningOutcomes' || field === 'modules') {
            // Handle JSON arrays
            updateData[field] = req.body[field] ? (Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]]) : null;
          } else if (field === 'courseType') {
            // Normalize courseType to array
            console.log(`Processing courseType:`, req.body[field], typeof req.body[field]);
            const normalized = normalizeCourseType(req.body[field]);
            console.log(`Normalized courseType:`, normalized);
            // Only set if we have valid values, otherwise skip the field (don't update it)
            if (normalized.length > 0) {
              updateData[field] = normalized;
            } else if (req.body[field] === null || req.body[field] === undefined) {
              // Allow null/undefined to clear the field
              updateData[field] = null;
            } else {
              // Invalid value provided, but don't throw - just skip this field
              console.warn(`Invalid courseType value: ${JSON.stringify(req.body[field])}, skipping field update`);
            }
          } else if (field === 'courseMode') {
            // Normalize courseMode to array
            console.log(`Processing courseMode:`, req.body[field], typeof req.body[field]);
            const normalized = normalizeCourseMode(req.body[field]);
            console.log(`Normalized courseMode:`, normalized);
            // Always set courseMode (normalizeCourseMode returns default 'PHYSICAL' if invalid)
            updateData[field] = normalized;
          } else if (field === 'courseSequence') {
            updateData[field] = req.body[field] ? parseInt(req.body[field]) : null;
          } else if (field === 'courseCode') {
            // Allow courseCode to be set or cleared (empty string becomes null)
            updateData[field] = req.body[field] && req.body[field].trim() !== '' ? req.body[field].trim() : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      });

      console.log('Update data to be saved:', JSON.stringify(updateData, null, 2));

      // Extract trainerAvailabilityId (not a course field)
      const { trainerAvailabilityId, trainerIds } = req.body;

      // Get existing course to check for fixedDate changes
      const existingCourse = await prisma.course.findUnique({
        where: { id: req.params.id },
        select: { fixedDate: true, trainerId: true },
      });

      if (!existingCourse) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check if updateData is empty
      if (Object.keys(updateData).length === 0) {
        console.warn('Update data is empty, no fields to update');
        // Still return the existing course to avoid errors
        const currentCourse = await prisma.course.findUnique({
          where: { id: req.params.id },
        });
        return res.json({ course: currentCourse, message: 'No fields to update' });
      }

      const course = await prisma.course.update({
        where: { id: req.params.id },
        data: updateData,
      });

      console.log('Course updated successfully:', course.id);

      // Handle trainer availability changes
      const oldFixedDate = existingCourse?.fixedDate;
      const newFixedDate = course.fixedDate;

      // If fixedDate is being changed, update availability accordingly
      if (oldFixedDate !== newFixedDate && course.trainerId) {
        // If old fixedDate existed, mark that availability as AVAILABLE again
        if (oldFixedDate) {
          try {
            const oldDate = new Date(oldFixedDate);
            oldDate.setHours(0, 0, 0, 0);
            const oldAvailability = await prisma.trainerAvailability.findFirst({
              where: {
                trainerId: course.trainerId,
                date: oldDate,
                status: 'BOOKED',
              },
            });
            if (oldAvailability) {
              await prisma.trainerAvailability.update({
                where: { id: oldAvailability.id },
                data: { status: 'AVAILABLE' },
              });
            }
          } catch (err) {
            console.error('Error releasing old availability:', err);
          }
        }

        // If new fixedDate is set and trainerAvailabilityId is provided, mark it as BOOKED
        if (newFixedDate && trainerAvailabilityId) {
          try {
            await prisma.trainerAvailability.update({
              where: { id: trainerAvailabilityId },
              data: { status: 'BOOKED' },
            });
          } catch (err) {
            console.error('Error booking new availability:', err);
          }
        }
      } else if (newFixedDate && trainerAvailabilityId && !oldFixedDate) {
        // If setting fixedDate for the first time
        try {
          await prisma.trainerAvailability.update({
            where: { id: trainerAvailabilityId },
            data: { status: 'BOOKED' },
          });
        } catch (err) {
          console.error('Error booking availability:', err);
        }
      }

      // Handle trainer assignments
      if (trainerIds && Array.isArray(trainerIds)) {
        // Delete existing CourseTrainer relationships
        await prisma.courseTrainer.deleteMany({
          where: { courseId: course.id },
        });
        // Create new relationships
        if (trainerIds.length > 0) {
          await prisma.courseTrainer.createMany({
            data: trainerIds.map((trainerId: string) => ({
              courseId: course.id,
              trainerId: trainerId,
            })),
          });
          // Update course's trainer_id to the first trainer
          await prisma.course.update({
            where: { id: course.id },
            data: { trainerId: trainerIds[0] },
          });
        } else {
          // If no trainers assigned, clear trainer_id
          await prisma.course.update({
            where: { id: course.id },
            data: { trainerId: null },
          });
        }
      }

      // Events are now created manually by admin using the Create Event form
      // Removed automatic event sync - admin will create events separately

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'UPDATE',
        entityType: 'course',
        entityId: course.id,
        description: `Updated course: ${course.title}`,
      });

      // Fetch the updated course to include trainer_id changes
      const updatedCourse = await prisma.course.findUnique({
        where: { id: course.id },
        include: {
          trainer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          courseTrainers: {
            include: {
              trainer: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      });

      return res.json({ course: updatedCourse });
    } catch (error: any) {
      console.error('Update course error:', error);
      return res.status(500).json({ error: 'Failed to update course', details: error.message });
    }
  }
);

// Approve course
router.put('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updated = await prisma.course.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // Notify trainer if course was created by trainer
    if (course.trainerId && !course.createdByAdmin) {
      await prisma.notification.create({
        data: {
          userId: course.trainerId,
          title: 'Course Approved',
          message: `Your course "${course.title}" has been approved.`,
          type: 'SUCCESS',
          relatedEntityType: 'course',
          relatedEntityId: course.id,
        },
      }).catch(() => {});
    }

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'APPROVE',
      entityType: 'course',
      entityId: course.id,
      description: `Approved course: ${course.title}`,
    });

    return res.json({ course: updated, message: 'Course approved successfully' });
  } catch (error: any) {
    console.error('Approve course error:', error);
    return res.status(500).json({ error: 'Failed to approve course', details: error.message });
  }
});

// Reject course
router.put('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { rejectionReason } = req.body;

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updated = await prisma.course.update({
      where: { id: req.params.id },
      data: { status: 'DENIED' },
    });

    // Notify trainer if course was created by trainer
    if (course.trainerId && !course.createdByAdmin) {
      await prisma.notification.create({
        data: {
          userId: course.trainerId,
          title: 'Course Rejected',
          message: `Your course "${course.title}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
          type: 'ERROR',
          relatedEntityType: 'course',
          relatedEntityId: course.id,
        },
      }).catch(() => {});
    }

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'REJECT',
      entityType: 'course',
      entityId: course.id,
      description: `Rejected course: ${course.title}${rejectionReason ? ` - ${rejectionReason}` : ''}`,
    });

    return res.json({ course: updated, message: 'Course rejected successfully' });
  } catch (error: any) {
    console.error('Reject course error:', error);
    return res.status(500).json({ error: 'Failed to reject course', details: error.message });
  }
});

// Assign trainer to course (via CourseTrainer relationship)
router.post('/:id/trainers', async (req: AuthRequest, res: Response) => {
  try {
    const { trainerId } = req.body;

    if (!trainerId) {
      return res.status(400).json({ error: 'Trainer ID is required' });
    }

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if trainer is already assigned
    const existing = await prisma.courseTrainer.findFirst({
      where: {
        courseId: req.params.id,
        trainerId: trainerId,
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Trainer is already assigned to this course' });
    }

    // Check if course already has a trainer_id set
    const hasPrimaryTrainer = !!course.trainerId;
    
    // Create CourseTrainer relationship
    const courseTrainer = await prisma.courseTrainer.create({
      data: {
        courseId: req.params.id,
        trainerId: trainerId,
      },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // Update course's trainer_id if it's not set yet (set first assigned trainer as primary)
    if (!hasPrimaryTrainer) {
      await prisma.course.update({
        where: { id: req.params.id },
        data: { trainerId: trainerId },
      });
    }

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'UPDATE',
      entityType: 'course',
      entityId: course.id,
      description: `Assigned trainer to course: ${course.title}`,
    });

    return res.status(201).json({ courseTrainer, message: 'Trainer assigned successfully' });
  } catch (error: any) {
    console.error('Assign trainer error:', error);
    return res.status(500).json({ error: 'Failed to assign trainer', details: error.message });
  }
});

// Assign trainer to course (legacy route - sets trainerId directly)
router.put('/:id/assign-trainer', async (req: AuthRequest, res: Response) => {
  try {
    const { trainerId } = req.body;

    if (!trainerId) {
      return res.status(400).json({ error: 'Trainer ID is required' });
    }

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updated = await prisma.course.update({
      where: { id: req.params.id },
      data: { trainerId },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        courseTrainers: {
          include: {
            trainer: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'UPDATE',
      entityType: 'course',
      entityId: course.id,
      description: `Assigned trainer to course: ${course.title}`,
    });

    return res.json({ course: updated, message: 'Trainer assigned successfully' });
  } catch (error: any) {
    console.error('Assign trainer error:', error);
    return res.status(500).json({ error: 'Failed to assign trainer', details: error.message });
  }
});

// Create event from course (admin only) - with single category and mode
router.post(
  '/:id/create-event',
  [
    body('availabilityIds').isArray().withMessage('Availability IDs must be an array'),
    body('availabilityIds.*').notEmpty().withMessage('Each availability ID is required'),
    body('courseType').isIn(['IN_HOUSE', 'PUBLIC']).withMessage('Course type must be IN_HOUSE or PUBLIC'),
    body('courseMode').isIn(['PHYSICAL', 'ONLINE', 'HYBRID']).withMessage('Course mode must be PHYSICAL, ONLINE, or HYBRID'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const courseId = req.params.id;
      const { availabilityIds, courseType, courseMode, price, venue, city, state } = req.body;
      
      if (!Array.isArray(availabilityIds) || availabilityIds.length === 0) {
        return res.status(400).json({ error: 'At least one availability ID is required' });
      }

      // Get the course
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          courseTrainers: {
            select: {
              trainerId: true,
            },
          },
        },
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Get trainer ID - use course.trainerId or first CourseTrainer
      let trainerId = course.trainerId;
      if (!trainerId && course.courseTrainers && course.courseTrainers.length > 0) {
        trainerId = course.courseTrainers[0].trainerId;
      }

      if (!trainerId) {
        return res.status(400).json({ error: 'Course must have a trainer assigned' });
      }

      // Fetch all availability records to get the event dates
      const availabilities = await prisma.trainerAvailability.findMany({
        where: { id: { in: availabilityIds } },
        orderBy: { date: 'asc' },
      });

      if (availabilities.length !== availabilityIds.length) {
        return res.status(404).json({ error: 'One or more availability records not found' });
      }

      // Validate all availabilities belong to the trainer and are available
      for (const availability of availabilities) {
        if (availability.trainerId !== trainerId) {
          return res.status(400).json({ error: 'One or more availability records do not belong to the assigned trainer' });
        }
        if (availability.status !== 'AVAILABLE') {
          return res.status(400).json({ error: 'One or more selected dates are not available' });
        }
      }

      // Use the first date as the event date (primary date)
      const eventDate = new Date(availabilities[0].date);
      
      // Calculate end date from the last selected date
      const lastDate = new Date(availabilities[availabilities.length - 1].date);

      // Check if event already exists for this course and date
      const existingEvent = await prisma.event.findFirst({
        where: {
          courseId: course.id,
          eventDate: eventDate,
        },
      });

      if (existingEvent) {
        return res.status(400).json({ error: 'Event already exists for this course and date' });
      }

      // Generate event code for consistency
      const eventCode = `EVT-${Date.now().toString(36).toUpperCase()}`;

      // Use first date as start date and last date as end date
      const startDate = eventDate;
      const endDate = availabilities.length > 1 ? lastDate : null;

      // Create event with single courseType and courseMode (not arrays)
      // Standardized: Always set status to ACTIVE, generate event code, set createdBy to current admin
      const event = await prisma.event.create({
        data: {
          courseId: course.id,
          trainerId: trainerId,
          createdBy: req.user!.id, // Standardized: Use current admin instead of course creator
          eventCode: eventCode, // Standardized: Generate event code
          title: course.title,
          description: course.description,
          learningObjectives: course.learningObjectives ?? undefined,
          learningOutcomes: course.learningOutcomes ?? undefined,
          targetAudience: course.targetAudience,
          methodology: course.methodology,
          prerequisite: course.prerequisite,
          certificate: course.certificate,
          assessment: course.assessment,
          courseType: [courseType], // Store as array with single value
          courseMode: [courseMode], // Store as array with single value
          durationHours: course.durationHours,
          durationUnit: course.durationUnit,
          modules: course.modules ?? undefined,
          venue: venue || course.venue || null,
          price: price ? parseFloat(price) : (course.price || null),
          eventDate: eventDate,
          startDate: startDate, // Set to event date
          endDate: availabilities.length > 1 ? endDate : null, // Set end date if multi-day
          category: course.category,
          city: city || course.city || null,
          state: state || course.state || null,
          hrdcClaimable: course.hrdcClaimable,
          brochureUrl: course.brochureUrl,
          courseSequence: course.courseSequence,
          status: 'ACTIVE', // Standardized: Always set to ACTIVE (was course.status)
          maxPacks: null,
          professionalDevelopmentPoints: course.professionalDevelopmentPoints,
          professionalDevelopmentPointsOther: course.professionalDevelopmentPointsOther,
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

      // Block all selected dates
      try {
        // Update all selected availability records to BOOKED
        for (const availability of availabilities) {
          await prisma.trainerAvailability.update({
            where: { id: availability.id },
            data: { status: 'BOOKED' },
          });
        }

        console.log(`[Event Creation] Blocked ${availabilities.length} day(s) for trainer ${trainerId}: ${availabilities.map(a => a.date.toISOString().split('T')[0]).join(', ')}`);
      } catch (error: any) {
        console.error('Error updating trainer availability status:', error);
        // Continue even if update fails - event is already created
      }

      // Standardized: Notify trainer when event is created
      if (trainerId) {
        await prisma.notification.create({
          data: {
            userId: trainerId,
            title: 'New Event Created',
            message: `A new event "${course.title}" has been scheduled for ${eventDate.toLocaleDateString()}.`,
            type: 'INFO',
            relatedEntityType: 'event',
            relatedEntityId: event.id,
          },
        }).catch(() => {
          // Continue even if notification fails
        });
      }

      await createActivityLog({
        userId: req.user!.id,
        actionType: 'CREATE',
        entityType: 'event',
        entityId: event.id,
        description: `Created event from course: ${course.title}`,
        metadata: { eventCode, eventDate: eventDate.toISOString() },
      });

      return res.status(201).json({ event, message: 'Event created successfully' });
    } catch (error: any) {
      console.error('Create event from course error:', error);
      return res.status(500).json({ error: 'Failed to create event', details: error.message });
    }
  }
);

// Delete course
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = req.params.id;

    const existingCourse = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Delete the course (Prisma will cascade delete related records based on schema)
    await prisma.course.delete({
      where: { id: courseId },
    });

    await createActivityLog({
      userId: req.user!.id,
      actionType: 'DELETE',
      entityType: 'course',
      entityId: courseId,
      description: `Deleted course: ${existingCourse.title}`,
    });

    return res.json({ message: 'Course deleted successfully' });
  } catch (error: any) {
    console.error('Delete course error:', error);
    return res.status(500).json({ error: 'Failed to delete course', details: error.message });
  }
});

export default router;
