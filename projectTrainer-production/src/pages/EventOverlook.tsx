import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { apiClient } from '../lib/api-client';
import { Calendar, Users, BookOpen, MapPin, Clock, DollarSign, RefreshCw } from 'lucide-react';
// Helper function to format date
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-MY', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

interface Event {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  eventDate: string;
  venue: string | null;
  price: number | null;
  durationHours: number;
  durationUnit: string | null;
  category: string | null;
  courseType: string;
  hrdcClaimable: boolean;
  maxPacks: number | null;
  status?: string; // Event status (ACTIVE, COMPLETED, CANCELLED, etc.)
  totalParticipants?: number; // Total participants (sum of numberOfParticipants from registrations)
  isFromEventsTable?: boolean;
  _count: {
    registrations: number;
  };
  course?: {
    id: string;
    title: string;
    courseCode: string | null;
  };
}

export function EventOverlook() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('all');

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch events for this trainer (include all statuses to show status changes)
      // Don't filter by status - we want to show all events regardless of status
      const [eventsResponse, coursesResponse] = await Promise.all([
        apiClient.getEvents({ trainerId: user!.id }), // Fetch all events for trainer
        apiClient.getCourses({ status: 'ACTIVE' }),
      ]);
      
      // getEvents returns an array directly (not { events: [...] })
      const eventsArray = Array.isArray(eventsResponse) ? eventsResponse : [];
      const eventsFromTable = eventsArray.map((event: any) => {
        // Normalize status - ensure it's one of the valid event statuses
        let normalizedStatus = (event.status || event.eventStatus || 'ACTIVE').toUpperCase();
        // Map any invalid statuses to ACTIVE
        if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(normalizedStatus)) {
          normalizedStatus = 'ACTIVE';
        }
        return {
          ...event,
          eventDate: event.eventDate || event.event_date || event.startDate || event.start_date,
          status: normalizedStatus,
          isFromEventsTable: true,
          // Ensure _count is included
          _count: event._count || { registrations: 0 },
        };
      });
      
      // getCourses returns courses array directly, not { courses: [...] }
      const coursesArray = Array.isArray(coursesResponse) 
        ? coursesResponse 
        : (coursesResponse as any)?.courses || [];
      
      // Convert courses with fixed_date to event-like objects
      // Filter to only show courses for this trainer
      const eventsFromCourses = coursesArray
        .filter((course: any) => 
          (course.fixedDate || course.fixed_date) && 
          (course.trainerId === user!.id || course.trainer_id === user!.id)
        )
        .map((course: any) => ({
          id: `course-${course.id}`,
          courseId: course.id,
          title: course.title,
          description: course.description,
          eventDate: course.fixedDate || course.fixed_date,
          venue: course.venue,
          price: course.price,
          durationHours: course.durationHours || course.duration_hours,
          durationUnit: course.durationUnit || course.duration_unit,
          category: course.category,
          courseType: course.courseType || course.course_type,
          hrdcClaimable: course.hrdcClaimable || course.hrdc_claimable,
          status: 'ACTIVE', // Courses with fixed_date are considered ACTIVE
          maxPacks: null,
          _count: {
            registrations: 0, // Courses with fixed_date don't have registrations yet
          },
          course: {
            id: course.id,
            title: course.title,
            courseCode: course.courseCode || course.course_code,
          },
          isFromEventsTable: false,
        }));
      
      // Combine and sort by date
      const allEvents = [...eventsFromTable, ...eventsFromCourses].sort((a, b) => {
        const dateA = new Date(a.eventDate).getTime();
        const dateB = new Date(b.eventDate).getTime();
        return dateA - dateB;
      });
      
      setEvents(allEvents);
      
      // Debug logging
      console.log('[EventOverlook] Events fetched:', {
        fromTable: eventsFromTable.length,
        fromCourses: eventsFromCourses.length,
        total: allEvents.length,
        eventsWithStatus: eventsFromTable.filter((e: Event) => e.status).length,
        sampleEventStatus: eventsFromTable[0]?.status,
      });
    } catch (err: any) {
      console.error('[EventOverlook] Error fetching events:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchEvents();
    }
  }, [user?.id, fetchEvents]);

  // Auto-refresh events when page becomes visible (in case admin updated status)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.id && !loading) {
        // Refresh events when page becomes visible (e.g., user switches back to tab)
        // Only refresh if not already loading to avoid unnecessary requests
        fetchEvents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id, loading, fetchEvents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchEvents}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'PENDING_APPROVAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter events based on active tab
  const filteredEvents = events.filter((event) => {
    if (activeTab === 'all') return true;
    const eventStatus = (event.status || 'ACTIVE').toUpperCase();
    return eventStatus === activeTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Event Overview</h1>
          <p className="text-sm text-gray-600 mt-1">
            View all your events and their current status
          </p>
        </div>
        <button
          onClick={fetchEvents}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          title="Refresh events"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('all')}
            className={`${
              activeTab === 'all'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            All Events
            <span className="ml-2 text-xs bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full">
              {events.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`${
              activeTab === 'ACTIVE'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Active
            <span className="ml-2 text-xs bg-green-100 text-green-600 py-0.5 px-2 rounded-full">
              {events.filter(e => (e.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('COMPLETED')}
            className={`${
              activeTab === 'COMPLETED'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Completed
            <span className="ml-2 text-xs bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full">
              {events.filter(e => (e.status || 'ACTIVE').toUpperCase() === 'COMPLETED').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('CANCELLED')}
            className={`${
              activeTab === 'CANCELLED'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Cancelled
            <span className="ml-2 text-xs bg-red-100 text-red-600 py-0.5 px-2 rounded-full">
              {events.filter(e => (e.status || 'ACTIVE').toUpperCase() === 'CANCELLED').length}
            </span>
          </button>
        </nav>
      </div>

      {filteredEvents.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">
                {activeTab === 'all' ? 'No events found' : `No ${activeTab.toLowerCase()} events found`}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {activeTab === 'all' 
                  ? 'Events are created from courses with fixed dates. Once a fixed date passes or is today, it becomes an event.'
                  : `There are no ${activeTab.toLowerCase()} events at the moment.`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const eventDate = event.eventDate || (event as any).event_date;
            const maxPacks = event.maxPacks || (event as any).max_packs;
            // Use totalParticipants if available (from backend), otherwise calculate from registrations
            const totalParticipants = event.totalParticipants !== undefined 
              ? event.totalParticipants 
              : (event._count?.registrations || 0); // Fallback to registration count if totalParticipants not available
            const participantsAvailable = maxPacks ? maxPacks - totalParticipants : null;

            return (
              <Card key={event.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1">
                      {event.title}
                    </h3>
                    {event.status && (
                      <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                    )}
                  </div>
                  {event.course?.courseCode && (
                    <p className="text-xs text-gray-500">Code: {event.course.courseCode}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {eventDate && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span>{formatDate(new Date(eventDate))}</span>
                      </div>
                    )}

                    {event.venue && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span>{event.venue}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>
                        {event.durationHours} {event.durationUnit || 'hours'}
                      </span>
                    </div>

                    {event.price && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <DollarSign className="w-4 h-4 text-gray-500" />
                        <span>RM {parseFloat(String(event.price)).toFixed(2)}</span>
                      </div>
                    )}

                    {event.category && (
                      <div className="flex items-center gap-2 text-sm">
                        <BookOpen className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">{event.category}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-700">Participants:</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600">
                          {totalParticipants}
                          {maxPacks && ` / ${maxPacks}`}
                        </span>
                      </div>
                      {!event.isFromEventsTable && (
                        <p className="text-xs text-gray-500 mt-2 italic">
                          Event will be created when first registration is made
                        </p>
                      )}
                      {maxPacks && event.isFromEventsTable && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${(totalParticipants / maxPacks) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {participantsAvailable !== null && participantsAvailable > 0
                              ? `${participantsAvailable} ${participantsAvailable === 1 ? 'slot' : 'slots'} available`
                              : 'Fully booked'}
                          </p>
                        </div>
                      )}
                    </div>

                    {event.hrdcClaimable && (
                      <div className="pt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          HRDC Claimable
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

