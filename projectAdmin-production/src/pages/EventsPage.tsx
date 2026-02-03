import React, { useEffect, useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { apiClient } from '../lib/api-client';
import { formatDate } from '../utils/helpers';
import { Calendar, MapPin, Users, Filter, X, MessageSquare, UserPlus } from 'lucide-react';
import { showToast } from '../components/common/Toast';
import { FeedbackQRModal } from '../components/events/FeedbackQRModal';
import { AddParticipantsModal } from '../components/events/AddParticipantsModal';
import { Event } from '../types';

export const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    trainerId: '',
    courseId: '',
  });
  const [selectedEventForQR, setSelectedEventForQR] = useState<Event | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<Event | null>(null);
  const [showAddParticipantsModal, setShowAddParticipantsModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [events, searchTerm, selectedStatus, selectedMonth]);

  const fetchEvents = async () => {
    try {
      const params: any = {};
      if (advancedFilters.trainerId) params.trainerId = advancedFilters.trainerId;
      if (advancedFilters.courseId) params.courseId = advancedFilters.courseId;

      const response = await apiClient.getEvents(params);
      let fetchedEvents = response.events || [];
      
      // Auto-complete past ACTIVE events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pastActiveEvents = fetchedEvents.filter((event: Event) => {
        if (event.status !== 'ACTIVE') return false;
        const eventEndDate = event.endDate ? new Date(event.endDate) : new Date(event.eventDate);
        eventEndDate.setHours(0, 0, 0, 0);
        return eventEndDate < today;
      });

      if (pastActiveEvents.length > 0) {
        try {
          // Call backend to auto-complete past events
          await apiClient.autoCompletePastEvents();
          
          // Update local state
          fetchedEvents = fetchedEvents.map((event: Event) => {
            if (pastActiveEvents.find((e: Event) => e.id === event.id)) {
              return { ...event, status: 'COMPLETED' as const };
            }
            return event;
          });
          
          showToast(`Auto-completed ${pastActiveEvents.length} past event(s)`, 'success');
        } catch (error: any) {
          console.error('Error auto-completing past events:', error);
          // Continue with existing events even if auto-complete fails
        }
      }

      setEvents(fetchedEvents);
    } catch (error: any) {
      console.error('Error fetching events:', error);
      showToast(error.message || 'Error fetching events', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: string) => {
    setUpdatingStatus((prev) => ({ ...prev, [eventId]: true }));
    try {
      const response = await apiClient.updateEventStatus(eventId, newStatus);
      
      // Update local state
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === eventId
            ? { ...event, status: newStatus as 'ACTIVE' | 'COMPLETED' | 'CANCELLED' }
            : event
        )
      );
      
      showToast(response.message || 'Event status updated successfully', 'success');
    } catch (error: any) {
      console.error('Error updating event status:', error);
      showToast(error.message || 'Failed to update event status', 'error');
    } finally {
      setUpdatingStatus((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  const applyFilters = () => {
    let filtered = [...events];

    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.course?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.trainer?.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(event => event.status === selectedStatus);
    }

    if (selectedMonth !== 'all') {
      filtered = filtered.filter(event => {
        if (!event.eventDate) return false;
        const eventMonth = new Date(event.eventDate).getMonth();
        return eventMonth === parseInt(selectedMonth);
      });
    }

    setFilteredEvents(filtered);
  };

  const handleAdvancedSearch = () => {
    fetchEvents();
    setShowAdvancedFilters(false);
  };

  const clearAdvancedFilters = () => {
    setAdvancedFilters({ trainerId: '', courseId: '' });
    fetchEvents();
  };

  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return 'success';
      case 'COMPLETED': return 'info';
      case 'CANCELLED': return 'danger';
      default: return 'default';
    }
  };

  const months = [
    { value: 'all', label: 'All Months' },
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Events</h1>
          <p className="text-gray-600 mt-1">{filteredEvents.length} event(s) found</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="secondary" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
            <Filter size={18} className="mr-2" />
            Advanced Filters
          </Button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Advanced Filters</h2>
              <button onClick={() => setShowAdvancedFilters(false)}>
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Trainer ID"
                value={advancedFilters.trainerId}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, trainerId: e.target.value })}
                placeholder="Filter by trainer ID"
              />
              <Input
                label="Course ID"
                value={advancedFilters.courseId}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, courseId: e.target.value })}
                placeholder="Filter by course ID"
              />
            </div>
            <div className="flex justify-end space-x-3 mt-4">
              <Button variant="secondary" onClick={clearAdvancedFilters}>
                Clear
              </Button>
              <Button variant="primary" onClick={handleAdvancedSearch}>
                Apply Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search events..."
            />
          </div>
          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
          <Select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={months}
          />
        </div>
      </Card>

      {/* Events Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredEvents.length === 0 ? (
          <div className="col-span-2 text-center py-12 text-gray-500">
            No events found
          </div>
        ) : (
          filteredEvents.map((event) => (
            <Card key={event.id} className="hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {event.title || event.course?.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge variant={getStatusVariant(event.status)}>
                        {event.status}
                      </Badge>
                      {event.course?.courseCode && (
                        <Badge variant="info">{event.course.courseCode}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0" style={{ width: '160px' }}>
                    <Select
                      value={event.status}
                      onChange={(e) => handleStatusChange(event.id, e.target.value)}
                      disabled={updatingStatus[event.id]}
                      options={[
                        { value: 'ACTIVE', label: 'Active' },
                        { value: 'COMPLETED', label: 'Completed' },
                        { value: 'CANCELLED', label: 'Cancelled' },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  {event.startDate && event.endDate && (
                    <div className="flex items-center">
                      <Calendar size={16} className="mr-2 text-teal-600" />
                      <span className="font-medium">Event Date:</span>
                      <span className="ml-2">
                        {formatDate(event.startDate)} - {formatDate(event.endDate)}
                      </span>
                    </div>
                  )}
                  {event.venue && (
                    <div className="flex items-center">
                      <MapPin size={16} className="mr-2 text-teal-600" />
                      <span className="font-medium">Venue:</span>
                      <span className="ml-2">{event.venue}</span>
                    </div>
                  )}
                  {event.city && (
                    <div className="flex items-center">
                      <MapPin size={16} className="mr-2 text-teal-600" />
                      <span className="font-medium">Location:</span>
                      <span className="ml-2">
                        {event.city}
                        {event.state && `, ${event.state}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center">
                    <Users size={16} className="mr-2 text-teal-600" />
                    <span className="font-medium">Trainer:</span>
                    <span className="ml-2">{event.trainer?.fullName || 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Users size={16} className="mr-2 text-teal-600" />
                    <span className="font-medium">Registrations:</span>
                    <span className="ml-2">
                      {event.totalParticipants || 0}
                      {event.maxPacks && ` / ${event.maxPacks}`}
                    </span>
                  </div>
                </div>

                {event.registrations && event.registrations.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Registrations:</h4>
                    <div className="space-y-1">
                      {event.registrations.slice(0, 3).map((reg) => (
                        <div key={reg.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">
                            {reg.client?.userName || reg.client?.companyEmail || 'Unknown'}
                          </span>
                          <div className="flex items-center space-x-2">
                            {reg.packNumber && (
                              <Badge variant="info" className="text-xs">Pack #{reg.packNumber}</Badge>
                            )}
                            <Badge variant={reg.status === 'APPROVED' ? 'success' : 'warning'} className="text-xs">
                              {reg.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {event.registrations.length > 3 && (
                        <p className="text-xs text-gray-500 mt-1">
                          +{event.registrations.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t space-y-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSelectedEventForParticipants(event);
                      setShowAddParticipantsModal(true);
                    }}
                    className="w-full"
                  >
                    <UserPlus size={16} className="mr-2" />
                    Add Participants (New Client)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedEventForQR(event);
                      setShowQRModal(true);
                    }}
                    className="w-full"
                  >
                    <MessageSquare size={16} className="mr-2" />
                    Generate Feedback Form
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {selectedEventForQR && (
        <FeedbackQRModal
          isOpen={showQRModal}
          onClose={() => {
            setShowQRModal(false);
            setSelectedEventForQR(null);
          }}
          eventId={selectedEventForQR.id}
          eventTitle={selectedEventForQR.title || selectedEventForQR.course?.title || 'Event'}
        />
      )}

      {selectedEventForParticipants && (
        <AddParticipantsModal
          isOpen={showAddParticipantsModal}
          onClose={() => {
            setShowAddParticipantsModal(false);
            setSelectedEventForParticipants(null);
          }}
          eventId={selectedEventForParticipants.id}
          eventTitle={selectedEventForParticipants.title || selectedEventForParticipants.course?.title || 'Event'}
          onSuccess={() => {
            fetchEvents();
          }}
        />
      )}
    </div>
  );
};

