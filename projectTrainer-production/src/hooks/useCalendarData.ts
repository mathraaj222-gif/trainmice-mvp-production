import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../lib/api-client';
import { BookingWithCourse, TrainerAvailability } from '../types/database';
import { formatDate } from '../lib/calendarUtils';

interface UseCalendarDataReturn {
  bookings: BookingWithCourse[];
  availabilities: TrainerAvailability[];
  blockedWeekdays: number[];
  blockedDates: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCalendarData(trainerId: string, startDate: Date, endDate: Date): UseCalendarDataReturn {
  const [bookings, setBookings] = useState<BookingWithCourse[]>([]);
  const [availabilities, setAvailabilities] = useState<TrainerAvailability[]>([]);
  const [blockedWeekdays, setBlockedWeekdays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // ✅ FIX: use stable timestamps instead of Date objects
  // ---------------------------------------------------------
  const startTs = startDate.getTime();
  const endTs = endDate.getTime();

  // ---------------------------------------------------------
  // FETCH DATA (fixed dependencies)
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!trainerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      // Fetch bookings from backend API (already filtered by trainer in backend)
      const bookingResponse = await apiClient.get<{ bookingRequests: any[] }>('/bookings');

      // Fetch events for this trainer (events created from courses)
      // apiClient.getEvents already returns an array directly
      const allEvents = await apiClient.getEvents({ trainerId, status: 'ACTIVE' }) || [];
      
      console.log('[useCalendarData] Fetched events for calendar:', allEvents.length);

      // Filter bookings by date range on the client & normalize shapes
      const allBookings = bookingResponse.bookingRequests || [];
      const filteredBookings: BookingWithCourse[] = allBookings
        .map((booking) => {
          // requested_date should already be in YYYY-MM-DD format from backend
          let requestedDate = booking.requested_date || booking.requestedDate || null;
          
          // If it's a Date object or ISO string, format it as YYYY-MM-DD
          if (requestedDate && typeof requestedDate !== 'string') {
            const date = new Date(requestedDate);
            requestedDate = formatDate(date);
          } else if (requestedDate && typeof requestedDate === 'string' && requestedDate.includes('T')) {
            // If it's an ISO string, extract just the date part
            requestedDate = requestedDate.split('T')[0];
          }
          
          return {
            ...booking,
            requested_date: requestedDate,
            status: (booking.status || '').toLowerCase(),
            processed_at: booking.processed_at || booking.processedAt || booking.created_at || booking.createdAt || new Date().toISOString(),
          };
        })
        .filter((b) => {
          if (!b.requested_date) return false;
          // requested_date should already be in YYYY-MM-DD format
          const dStr = b.requested_date.split('T')[0]; // Remove time if present
          return dStr >= startStr && dStr <= endStr;
        });

      // Convert events to booking-like format for calendar display
      const eventBookings: BookingWithCourse[] = allEvents
        .map((event: any) => {
          let eventDate = event.eventDate || event.event_date || null;
          let endDate = event.endDate || event.end_date || null;
          
          // Format dates
          if (eventDate && typeof eventDate !== 'string') {
            eventDate = formatDate(new Date(eventDate));
          } else if (eventDate && typeof eventDate === 'string' && eventDate.includes('T')) {
            eventDate = eventDate.split('T')[0];
          }
          
          if (endDate && typeof endDate !== 'string') {
            endDate = formatDate(new Date(endDate));
          } else if (endDate && typeof endDate === 'string' && endDate.includes('T')) {
            endDate = endDate.split('T')[0];
          }
          
          // Ensure courses object is always created (even if course relation is missing, use event data)
          // Events have their own title field, so use that first, then fall back to course.title
          const courseData = event.course || {};
          const eventTitle = event.title || courseData.title || 'Event';
          
          const coursesObject = {
            id: event.courseId || event.course_id || courseData.id || event.id,
            trainer_id: event.trainerId || event.trainer_id || '',
            title: eventTitle, // Events have their own title field - use this for calendar display
            description: event.description || courseData.description || null,
            learning_objectives: event.learningObjectives || courseData.learningObjectives || null,
            learning_outcomes: event.learningOutcomes || courseData.learningOutcomes || null,
            target_audience: event.targetAudience || courseData.targetAudience || null,
            methodology: event.methodology || courseData.methodology || null,
            prerequisite: event.prerequisite || courseData.prerequisite || null,
            certificate: event.certificate || courseData.certificate || null,
            professional_development_points: event.professionalDevelopmentPoints || courseData.professionalDevelopmentPoints || null,
            professional_development_points_other: event.professionalDevelopmentPointsOther || courseData.professionalDevelopmentPointsOther || null,
            assessment: event.assessment ?? courseData.assessment ?? false,
            course_type: event.courseType || courseData.courseType || null,
            course_mode: event.courseMode || courseData.courseMode || null,
            duration_hours: event.durationHours ?? courseData.durationHours ?? 0,
            duration_unit: event.durationUnit || courseData.durationUnit || 'hours',
            event_date: eventDate,
            category: event.category || courseData.category || null,
            price: event.price ?? courseData.price ?? null,
            venue: event.venue || courseData.venue || null,
            hrdc_claimable: event.hrdcClaimable ?? courseData.hrdcClaimable ?? false,
            modules: event.modules || courseData.modules || [],
            status: 'published' as const,
            course_sequence: event.courseSequence ?? courseData.courseSequence ?? null,
            created_at: event.createdAt || event.created_at || new Date().toISOString(),
          };
          
          // Determine request_type with proper type assertion
          const requestType: 'public' | 'inhouse' | null = Array.isArray(event.courseType) 
            ? (event.courseType.includes('PUBLIC') ? 'public' as const : 'inhouse' as const)
            : (event.courseType === 'PUBLIC' ? 'public' as const : 'inhouse' as const);
          
          return {
            id: event.id,
            course_id: event.courseId || event.course_id,
            trainer_id: event.trainerId || event.trainer_id,
            client_id: null,
            request_type: requestType,
            client_name: null,
            client_email: null,
            requested_date: eventDate,
            end_date: endDate,
            requested_time: null,
            requested_month: null,
            selected_slots: null,
            status: 'booked' as const, // Events are confirmed/booked (use 'booked' status to match BookingRequest type)
            location: event.venue || null,
            city: event.city || null,
            state: event.state || null,
            created_at: event.createdAt || event.created_at || new Date().toISOString(),
            processed_at: event.createdAt || event.created_at || new Date().toISOString(),
            courses: coursesObject, // Always include course object (from event data if course relation missing)
          };
        })
        .filter((b) => {
          if (!b.requested_date) return false;
          const dStr = b.requested_date.split('T')[0];
          // Include if start date is in range, or if end date exists and is in range
          if (dStr >= startStr && dStr <= endStr) return true;
          if (b.end_date) {
            const endStr2 = b.end_date.split('T')[0];
            return endStr2 >= startStr && endStr2 <= endStr;
          }
          return false;
        });

      // Create a set of event identifiers (courseId + eventDate) for matching
      // This helps us filter out confirmed bookings that have corresponding events
      const eventIdentifiers = new Set<string>();
      eventBookings.forEach((eventBooking) => {
        if (eventBooking.course_id && eventBooking.requested_date) {
          const courseId = eventBooking.course_id;
          const eventDate = eventBooking.requested_date.split('T')[0]; // Ensure YYYY-MM-DD format
          eventIdentifiers.add(`${courseId}:${eventDate}`);
        }
      });

      // Filter out confirmed bookings that have a corresponding event
      // This eliminates duplicates where both a booking request and event exist for the same course/date
      const deduplicatedBookings = filteredBookings.filter((booking) => {
        const bookingStatus = (booking.status || '').toLowerCase();
        
        // Only filter out confirmed bookings
        if (bookingStatus !== 'confirmed') {
          return true; // Keep all non-confirmed bookings
        }
        
        // For confirmed bookings, check if there's a matching event
        if (booking.course_id && booking.requested_date) {
          const courseId = booking.course_id;
          const bookingDate = booking.requested_date.split('T')[0]; // Ensure YYYY-MM-DD format
          const identifier = `${courseId}:${bookingDate}`;
          
          // If there's a matching event, exclude this booking (event will be shown instead)
          if (eventIdentifiers.has(identifier)) {
            return false; // Exclude - event will be shown instead
          }
        }
        
        // Keep confirmed bookings that don't have a matching event (edge case)
        return true;
      });

      // Combine deduplicated bookings and events
      const allCalendarBookings = [...deduplicatedBookings, ...eventBookings];

      // Fetch availability from backend API
      const availabilityResponse = await apiClient.getTrainerAvailability(trainerId, {
        startDate: startStr,
        endDate: endStr,
      });

      // getTrainerAvailability already extracts response.availability, so it should be an array
      // But handle both cases for safety
      const availabilityArray = Array.isArray(availabilityResponse) 
        ? availabilityResponse 
        : (availabilityResponse as any)?.availability || [];

      const normalizedAvailability: TrainerAvailability[] = availabilityArray.map((item: any) => ({
        id: item.id,
        trainer_id: item.trainerId || item.trainer_id,
        date: (item.date || item.dateString || '').split('T')[0] || item.date,
        status: (item.status || 'AVAILABLE').toString().toLowerCase(),
        start_time: item.startTime || item.start_time || null,
        end_time: item.endTime || item.end_time || null,
        created_at: item.createdAt || item.created_at || undefined,
      }));

      const blockedResponse = await apiClient.getTrainerBlockedDays(trainerId);
      const blockedDays = blockedResponse.blockedDays || [];

      setBookings(allCalendarBookings);
      setAvailabilities(normalizedAvailability);
      setBlockedWeekdays(blockedDays);
    } catch (err) {
      console.error('Error fetching:', err);
      setError(err instanceof Error ? err.message : 'Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [
    trainerId,
    startTs, // <-- stable
    endTs    // <-- stable
  ]);

  // ---------------------------------------------------------
  // RUN FETCH ON MOUNT + WHEN MONTH CHANGES
  // ---------------------------------------------------------
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------
  // EXPAND BLOCKED WEEKDAYS TO REAL DATES
  // ---------------------------------------------------------
  const expandedBlockedDates = useMemo(() => {
    const dates: string[] = [];
    const cur = new Date(startDate);

    while (cur <= endDate) {
      if (blockedWeekdays.includes(cur.getDay())) {
        dates.push(cur.toISOString().substring(0, 10));
      }
      cur.setDate(cur.getDate() + 1);
    }

    return dates;
  }, [blockedWeekdays, startTs, endTs]);

  return {
    bookings,
    availabilities,
    blockedWeekdays,
    blockedDates: expandedBlockedDates,
    loading,
    error,
    refetch: fetchData,
  };
}
