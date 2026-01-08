import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Info, Calendar } from 'lucide-react';
import { Course, Trainer, TrainerAvailability } from '../lib/api-client';
import { auth } from '../lib/auth';
import { apiClient } from '../lib/api-client';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
} from 'date-fns';
import { formatDuration } from '../utils/calendarHelpers';

type InHouseCalendarBookingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  course: Course;
  trainer: Trainer | null;
};

type DateAvailabilityMap = {
  [date: string]: TrainerAvailability[];
};

export function InHouseCalendarBookingModal({
  isOpen,
  onClose,
  course,
  trainer,
}: InHouseCalendarBookingModalProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2024, 11, 1));
  const [availability, setAvailability] = useState<TrainerAvailability[]>([]);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [tentativeCounts, setTentativeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedAvailabilityIds, setSelectedAvailabilityIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    city: '',
    state: '',
    userName: '',
    userEmail: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAvailability();
      fetchUserData();
    }
  }, [isOpen, currentMonth]);

  const fetchUserData = async () => {
    try {
      const { user } = await auth.getSession();
      if (user) {
        try {
          // Fetch client profile to get company information
          const profileResponse = await apiClient.getClientProfile();
          const client = profileResponse.client;
          
          const userName = user.fullName || client?.userName || user.email?.split('@')[0] || '';
          const userEmail = user.email || client?.companyEmail || '';
          setFormData(prev => ({
            ...prev,
            userName,
            userEmail,
            companyName: client?.companyName || '',
            address: client?.companyAddress || '',
            city: client?.city || '',
            state: client?.state || '',
          }));
        } catch (profileError) {
          console.error('Error fetching client profile:', profileError);
          // Fallback to user data if profile fetch fails
          const userName = user.fullName || user.email?.split('@')[0] || '';
          const userEmail = user.email || '';
          setFormData(prev => ({
            ...prev,
            userName,
            userEmail,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const fetchAvailability = async () => {
    if (!trainer) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const data = await apiClient.getTrainerAvailability(trainer.id, {
        startDate: monthStart,
        endDate: monthEnd,
        courseId: course.id,
      });
      setAvailability(data?.availability || data || []);
      setPendingCounts(data?.pendingCounts || {});
      setTentativeCounts(data?.tentativeCounts || {});
    } catch (error) {
      console.error('Error fetching availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateAvailabilityMap = (): DateAvailabilityMap => {
    const map: DateAvailabilityMap = {};
    availability.forEach(avail => {
      // Ensure date is in YYYY-MM-DD format for consistent lookup
      const dateKey = avail.date || '';
      if (dateKey && !map[dateKey]) {
        map[dateKey] = [];
      }
      if (dateKey) {
        map[dateKey].push(avail);
      }
    });
    return map;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const getCalendarDays = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const startDay = getDay(start);
    const paddingDays = Array.from({ length: startDay }, (_, i) =>
      addDays(start, -startDay + i)
    );

    return [...paddingDays, ...days];
  };

  // Calculate number of days needed based on course duration
  const getCourseDays = (): number => {
    if (!course.duration_hours || !course.duration_unit) return 1;
    
    if (course.duration_unit === 'days') {
      // If duration_unit is 'days', duration_hours contains the raw day value
      // (e.g., if user entered 2 days, duration_hours = 2)
      return course.duration_hours;
    } else {
      // If duration_unit is 'hours', calculate days (assuming 9 hours per day)
      // Round up to ensure we cover all hours
      return Math.ceil(course.duration_hours / 9);
    }
  };

  const handleDateClick = (date: Date) => {
    // Format date as YYYY-MM-DD string to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    // Calculate number of days needed
    const daysNeeded = getCourseDays();
    
    // Generate all dates needed for the course
    const datesToSelect: string[] = [];
    for (let i = 0; i < daysNeeded; i++) {
      const currentDate = new Date(date);
      currentDate.setDate(currentDate.getDate() + i);
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      datesToSelect.push(`${y}-${m}-${d}`);
    }
    
    // Validate availability for all dates
    const allDatesAvailable = datesToSelect.every((dateStr) => {
      const dateAvailForDay = dateAvailMap[dateStr] || [];
      return dateAvailForDay.some(
        (a) => a.status === 'available' || a.status === 'tentative'
      );
    });
    
    if (!allDatesAvailable) {
      setSubmitMessage({
        type: 'error',
        text: `Not all required dates are available. This course requires ${daysNeeded} day(s), and some dates are not available.`,
      });
      return;
    }
    
    // If clicking the same start date, deselect
    if (selectedDate === dateString) {
      setSelectedDate(null);
      setSelectedDates([]);
      setSelectedAvailabilityIds([]);
    } else {
      setSelectedDate(dateString);
      setSelectedDates(datesToSelect);
      
      // Capture availability IDs for selected dates
      const availabilityIds: string[] = [];
      datesToSelect.forEach((dateStr) => {
        const dateAvailForDay = dateAvailMap[dateStr] || [];
        // Get the first available availability for each date
        const available = dateAvailForDay.find(
          (a) => a.status === 'available' || a.status === 'tentative'
        );
        if (available && available.id) {
          availabilityIds.push(available.id);
        }
      });
      setSelectedAvailabilityIds(availabilityIds);
      
      // Show queue information if there are pending or tentative bookings
      const queueCount = pendingCounts[dateString] || 0;
      const tentativeCount = tentativeCounts[dateString] || 0;
      
      if (queueCount > 0 || tentativeCount > 0) {
        let message = '';
        if (queueCount > 0 && tentativeCount > 0) {
          message = `Note: There ${queueCount === 1 ? 'is' : 'are'} ${queueCount} pending request${queueCount === 1 ? '' : 's'} and ${tentativeCount} tentative booking${tentativeCount === 1 ? '' : 's'} for this date. Your request will be processed in order.`;
        } else if (queueCount > 0) {
          message = `Note: There ${queueCount === 1 ? 'is' : 'are'} ${queueCount} pending request${queueCount === 1 ? '' : 's'} before you for this date. Your request will be processed in order.`;
        } else if (tentativeCount > 0) {
          message = `Note: There ${tentativeCount === 1 ? 'is' : 'are'} ${tentativeCount} tentative booking${tentativeCount === 1 ? '' : 's'} for this date.`;
        }
        setSubmitMessage({
          type: 'info',
          text: message,
        });
      } else {
        setSubmitMessage(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate) {
      setSubmitMessage({
        type: 'error',
        text: 'Please select a date for your in-house booking.',
      });
      return;
    }

    if (!formData.companyName || !formData.address || !formData.city || !formData.state || !formData.userName || !formData.userEmail) {
      setSubmitMessage({
        type: 'error',
        text: 'Please fill in all required fields.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitMessage(null);

      const { user } = await auth.getSession();
      if (!user) {
        setSubmitMessage({
          type: 'error',
          text: 'You must be logged in to submit a booking request.',
        });
        return;
      }

      // Ensure selectedDate is in YYYY-MM-DD format
      const startDate = selectedDate; // Already in YYYY-MM-DD format from handleDateClick
      const endDate = selectedDates.length > 1 ? selectedDates[selectedDates.length - 1] : startDate;
      
      // Use the first availability ID (for the start date) as the primary trainerAvailabilityId
      const trainerAvailabilityId = selectedAvailabilityIds.length > 0 ? selectedAvailabilityIds[0] : null;
      
      await apiClient.createBookingRequest({
        courseId: course.id,
        trainerId: trainer.id,
        clientId: user.id,
        requestType: 'INHOUSE',
        clientName: formData.userName,
        clientEmail: formData.userEmail,
        requestedDate: startDate,
        endDate: endDate,
        trainerAvailabilityId: trainerAvailabilityId,
        status: 'PENDING',
        location: formData.address,
        city: formData.city,
        state: formData.state,
      });

      setSubmitMessage({
        type: 'success',
        text: `Your in-house booking request has been submitted to Trainer ${trainer.custom_trainer_id}. They will review and get back to you.`,
      });

      setTimeout(() => {
        onClose();
        resetForm();
      }, 3000);
    } catch (error) {
      console.error('Error submitting booking:', error);
      setSubmitMessage({
        type: 'error',
        text: 'Failed to submit booking request. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedDate(null);
    setSelectedDates([]);
    setSelectedAvailabilityIds([]);
    setFormData({ companyName: '', address: '', city: '', state: '', userName: '', userEmail: '' });
    setSubmitMessage(null);
    setCurrentMonth(new Date(2024, 11, 1));
  };

  if (!isOpen) return null;

  if (!trainer) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-md w-full">
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">In-House Booking</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Trainer Not Yet Assigned</h3>
            <p className="text-gray-600 mb-6">
              This course does not have an assigned trainer yet. Please check back later or choose the "Request for Public" option.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dateAvailMap = getDateAvailabilityMap();
  const calendarDays = getCalendarDays();

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{course.title}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Trainer: {trainer.full_name} • Duration: {formatDuration(course.duration_hours, course.duration_unit)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium">
                  Select a day for this {formatDuration(course.duration_hours, course.duration_unit)} in-house course.
                </p>
                <p className="mt-1">
                  Click on an available date to choose it. Bookings are for full days only.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {format(currentMonth, 'MMMM yyyy')}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrevMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div
                    key={day}
                    className="text-center text-xs font-semibold text-gray-600 h-8 flex items-center justify-center"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm text-gray-600">Loading availability...</p>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, index) => {
                    // Format date as YYYY-MM-DD string consistently
                    const year = day.getFullYear();
                    const month = String(day.getMonth() + 1).padStart(2, '0');
                    const dayNum = String(day.getDate()).padStart(2, '0');
                    const dateString = `${year}-${month}-${dayNum}`;
                    const dateAvail = dateAvailMap[dateString] || [];
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    // Use simple full-day status based on normalized availability status
                    const hasAvailable = dateAvail.some(
                      (a) => a.status === 'available' || a.status === 'tentative'
                    );
                    const isBooked = dateAvail.every((a) => a.status === 'booked');
                    const status =
                      dateAvail.length === 0
                        ? 'unavailable'
                        : isBooked
                        ? 'booked'
                        : hasAvailable
                        ? 'available'
                        : 'tentative';
                    const isSelected = selectedDates.includes(dateString);

                    const bgColor = !isCurrentMonth
                      ? 'bg-gray-50 text-gray-300'
                      : status === 'available'
                      ? 'bg-green-100 hover:bg-green-200'
                      : status === 'tentative'
                      ? 'bg-yellow-100 hover:bg-yellow-200'
                      : status === 'booked'
                      ? 'bg-gray-200'
                      : 'bg-gray-300';

                    const canClick = isCurrentMonth && (status === 'available' || status === 'tentative');

                    return (
                      <button
                        key={index}
                        onClick={() => canClick && handleDateClick(day)}
                        disabled={!canClick}
                        className={`relative min-h-[60px] p-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-transparent'
                        } ${bgColor} ${
                          canClick ? 'cursor-pointer' : 'cursor-not-allowed'
                        }`}
                      >
                        <div className="text-sm font-medium">{format(day, 'd')}</div>
                        {(pendingCounts[dateString] > 0 || tentativeCounts[dateString] > 0) && (
                          <div className="absolute top-1 right-1 flex flex-col gap-0.5">
                            {pendingCounts[dateString] > 0 && (
                              <div 
                                className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold" 
                                title={`${pendingCounts[dateString]} pending request${pendingCounts[dateString] === 1 ? '' : 's'} before you`}
                              >
                                {pendingCounts[dateString]}
                              </div>
                            )}
                            {tentativeCounts[dateString] > 0 && (
                              <div 
                                className="bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold" 
                                title={`${tentativeCounts[dateString]} tentative booking${tentativeCounts[dateString] === 1 ? '' : 's'}`}
                              >
                                {tentativeCounts[dateString]}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                  <span className="text-gray-700">Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                  <span className="text-gray-700">Tentative</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-200 border border-gray-300 rounded"></div>
                  <span className="text-gray-700">Booked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-300 border border-gray-400 rounded"></div>
                  <span className="text-gray-700">Unavailable</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {selectedDate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Selected Date</p>
                      <p className="text-sm text-blue-700">
                        {(() => {
                          // Parse YYYY-MM-DD string as local date
                          const [year, month, day] = selectedDate.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          return date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          });
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter company name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.userName}
                    onChange={e => setFormData({ ...formData, userName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.userEmail}
                    onChange={e => setFormData({ ...formData, userEmail: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter company email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter city"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={e => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter state"
                  />
                </div>
              </div>

              {submitMessage && (
                <div
                  className={`p-4 rounded-lg ${
                    submitMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : submitMessage.type === 'info'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {submitMessage.text}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedDate || isSubmitting}
                  className="flex-1 px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Booking Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

    </>
  );
}
