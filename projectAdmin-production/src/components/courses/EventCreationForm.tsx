import React, { useState, useEffect } from 'react';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Course } from '../../types';
import { apiClient } from '../../lib/api-client';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface EventCreationFormProps {
  course: Course;
  onSubmit: (data: { 
    availabilityIds: string[]; 
    courseType: 'IN_HOUSE' | 'PUBLIC'; 
    courseMode: 'PHYSICAL' | 'ONLINE' | 'HYBRID';
    price: string | null;
    venue: string | null;
    city: string | null;
    state: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}

export const EventCreationForm: React.FC<EventCreationFormProps> = ({
  course,
  onSubmit,
  onCancel,
}) => {
  const [selectedAvailabilityIds, setSelectedAvailabilityIds] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<Array<{ date: string; availabilityId: string }>>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  
  // Calculate number of days needed based on course duration
  const calculateDaysNeeded = (): number => {
    if (!course.duration_hours || course.duration_hours <= 0) return 1;
    
    const unit = (course.duration_unit || 'hours').toLowerCase();
    
    if (unit === 'days') {
      return Math.ceil(course.duration_hours);
    } else if (unit === 'half_day') {
      return Math.ceil(course.duration_hours * 0.5);
    } else {
      // Default: hours - assume 8 hours per day
      return Math.ceil(course.duration_hours / 8);
    }
  };
  
  const daysNeeded = calculateDaysNeeded();
  const [courseType, setCourseType] = useState<'IN_HOUSE' | 'PUBLIC'>('PUBLIC');
  const [courseMode, setCourseMode] = useState<'PHYSICAL' | 'ONLINE' | 'HYBRID'>('PHYSICAL');
  const [price, setPrice] = useState(course.price?.toString() || '');
  const [venue, setVenue] = useState(course.venue || '');
  const [city, setCity] = useState((course as any).city || '');
  const [state, setState] = useState((course as any).state || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get trainer ID from course
  const trainerId = (course as any).trainer_id || (course as any).trainerId;

  // Get available course types and modes from the course
  const courseCourseTypes = Array.isArray(course.courseType) 
    ? course.courseType 
    : (course.courseType ? [course.courseType] : []);
  const courseTypeAlt = Array.isArray(course.course_type) 
    ? course.course_type 
    : (course.course_type ? [course.course_type] : []);
  const allCourseTypes = [...courseCourseTypes, ...courseTypeAlt].map(t => String(t).toUpperCase());
  const hasInHouse = allCourseTypes.includes('IN_HOUSE');
  const hasPublic = allCourseTypes.includes('PUBLIC');
  
  const courseCourseModes = Array.isArray(course.courseMode) 
    ? course.courseMode 
    : (course.courseMode ? [course.courseMode] : []);
  const courseModeAlt = Array.isArray(course.course_mode) 
    ? course.course_mode 
    : (course.course_mode ? [course.course_mode] : []);
  const allCourseModes = [...courseCourseModes, ...courseModeAlt].map(m => String(m).toUpperCase());
  const hasPhysical = allCourseModes.includes('PHYSICAL');
  const hasOnline = allCourseModes.includes('ONLINE');
  const hasHybrid = allCourseModes.includes('HYBRID');

  // Fetch trainer availability when component mounts
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!trainerId) {
        setAvailableDates([]);
        return;
      }

      try {
        setLoadingDates(true);
        const today = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 12);
        
        const availabilityResponse = await apiClient.getTrainerAvailability(trainerId, {
          startDate: today.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        });
        
        const availabilityArray = availabilityResponse?.availability || [];
        
        // Filter only AVAILABLE dates
        const available = availabilityArray.filter(
          (avail: any) => {
            const status = avail.status?.toUpperCase();
            return status === 'AVAILABLE';
          }
        );
        
        // Map to date strings and availability IDs
        const dates = available.map((avail: any) => {
          let dateStr = '';
          if (avail.date) {
            if (typeof avail.date === 'string') {
              dateStr = avail.date.split('T')[0];
            } else {
              dateStr = new Date(avail.date).toISOString().split('T')[0];
            }
          }
          return {
            date: dateStr,
            availabilityId: avail.id,
          };
        }).filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date));
        
        setAvailableDates(dates);
      } catch (error) {
        console.error('Error fetching trainer availability:', error);
        setAvailableDates([]);
      } finally {
        setLoadingDates(false);
      }
    };

    fetchAvailability();
  }, [trainerId]);

  // Initialize state based on available options
  useEffect(() => {
    if (hasPublic) {
      setCourseType('PUBLIC');
    } else if (hasInHouse) {
      setCourseType('IN_HOUSE');
    }
    
    if (hasPhysical) {
      setCourseMode('PHYSICAL');
    } else if (hasOnline) {
      setCourseMode('ONLINE');
    } else if (hasHybrid) {
      setCourseMode('HYBRID');
    }
  }, [hasInHouse, hasPublic, hasPhysical, hasOnline, hasHybrid]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (selectedAvailabilityIds.length !== daysNeeded) {
      newErrors.availabilityIds = `Please select exactly ${daysNeeded} date(s) from trainer availability (based on course duration: ${course.duration_hours} ${course.duration_unit || 'hours'})`;
    }

    if (!courseType) {
      newErrors.courseType = 'Course type is required';
    }

    if (!courseMode) {
      newErrors.courseMode = 'Course mode is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleDateToggle = (availabilityId: string) => {
    setSelectedAvailabilityIds(prev => {
      if (prev.includes(availabilityId)) {
        // Remove if already selected
        return prev.filter(id => id !== availabilityId);
      } else {
        // Add if not selected, but limit to daysNeeded
        if (prev.length >= daysNeeded) {
          return prev; // Don't add if we already have enough
        }
        return [...prev, availabilityId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        availabilityIds: selectedAvailabilityIds,
        courseType,
        courseMode,
        price: price ? price : null,
        venue: venue || null,
        city: city || null,
        state: state || null,
      });
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setLoading(false);
    }
  };

  const selectedDates = availableDates.filter(d => selectedAvailabilityIds.includes(d.availabilityId));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-2">Course Information</h3>
        <p className="text-sm text-blue-800">
          <strong>Course:</strong> {course.title}
        </p>
        {course.description && (
          <p className="text-sm text-blue-800 mt-1">
            <strong>Description:</strong> {course.description.substring(0, 100)}
            {course.description.length > 100 ? '...' : ''}
          </p>
        )}
        <p className="text-sm text-blue-800 mt-1">
          <strong>Duration:</strong> {course.duration_hours} {course.duration_unit || 'hours'} ({daysNeeded} day{daysNeeded > 1 ? 's' : ''} needed)
        </p>
      </div>

      {!trainerId ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            This course doesn't have a trainer assigned. Please assign a trainer to the course first.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Event Dates * ({daysNeeded} date{daysNeeded > 1 ? 's' : ''} required based on course duration)
            </label>
            {loadingDates && (
              <div className="mt-2 flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-gray-500">Loading trainer availability...</p>
              </div>
            )}
            {!loadingDates && availableDates.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No available dates found for this trainer. Please check trainer availability or select a different trainer.
              </p>
            )}
            {!loadingDates && availableDates.length > 0 && (
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {availableDates.map((dateOption) => {
                  const isSelected = selectedAvailabilityIds.includes(dateOption.availabilityId);
                  const isDisabled = !isSelected && selectedAvailabilityIds.length >= daysNeeded;
                  return (
                    <label
                      key={dateOption.availabilityId}
                      className={`flex items-center space-x-2 cursor-pointer p-2 rounded ${
                        isSelected
                          ? 'bg-teal-50 border-2 border-teal-500'
                          : isDisabled
                          ? 'bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleDateToggle(dateOption.availabilityId)}
                        disabled={isDisabled}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500 rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {new Date(dateOption.date).toLocaleDateString('en-MY', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {errors.availabilityIds && (
              <p className="text-xs text-red-600 mt-1">{errors.availabilityIds}</p>
            )}
            {selectedDates.length > 0 && (
              <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-xs font-medium text-teal-900 mb-2">Selected Dates ({selectedDates.length}/{daysNeeded}):</p>
                <ul className="text-xs text-teal-800 space-y-1">
                  {selectedDates
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((dateOption) => (
                      <li key={dateOption.availabilityId}>
                        • {new Date(dateOption.date).toLocaleDateString('en-MY', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Type * <span className="text-gray-500 text-xs">(Select ONE)</span>
            </label>
            <div className="space-y-2">
              {hasInHouse && (
                <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="courseType"
                    value="IN_HOUSE"
                    checked={courseType === 'IN_HOUSE'}
                    onChange={(e) => setCourseType(e.target.value as 'IN_HOUSE')}
                    className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">In-House</span>
                </label>
              )}
              {hasPublic && (
                <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="courseType"
                    value="PUBLIC"
                    checked={courseType === 'PUBLIC'}
                    onChange={(e) => setCourseType(e.target.value as 'PUBLIC')}
                    className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Public</span>
                </label>
              )}
            </div>
            {errors.courseType && (
              <p className="text-xs text-red-600 mt-1">{errors.courseType}</p>
            )}
            {!hasInHouse && !hasPublic && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <p className="text-sm text-amber-800">
                  This course doesn't have any course type set. Please edit the course first to set course type.
                </p>
              </div>
            )}
            {hasInHouse && hasPublic && (
              <p className="text-xs text-gray-500 mt-1">
                Course supports both In-House and Public. Select one for this event.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Mode * <span className="text-gray-500 text-xs">(Select ONE)</span>
            </label>
            <div className="space-y-2">
              {hasPhysical && (
                <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="courseMode"
                    value="PHYSICAL"
                    checked={courseMode === 'PHYSICAL'}
                    onChange={(e) => setCourseMode(e.target.value as 'PHYSICAL')}
                    className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Physical</span>
                </label>
              )}
              {hasOnline && (
                <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="courseMode"
                    value="ONLINE"
                    checked={courseMode === 'ONLINE'}
                    onChange={(e) => setCourseMode(e.target.value as 'ONLINE')}
                    className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Online</span>
                </label>
              )}
              {hasHybrid && (
                <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="radio"
                    name="courseMode"
                    value="HYBRID"
                    checked={courseMode === 'HYBRID'}
                    onChange={(e) => setCourseMode(e.target.value as 'HYBRID')}
                    className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Hybrid</span>
                </label>
              )}
            </div>
            {errors.courseMode && (
              <p className="text-xs text-red-600 mt-1">{errors.courseMode}</p>
            )}
            {!hasPhysical && !hasOnline && !hasHybrid && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <p className="text-sm text-amber-800">
                  This course doesn't have any course mode set. Please edit the course first to set course mode.
                </p>
              </div>
            )}
            {(hasPhysical && hasOnline) || (hasPhysical && hasHybrid) || (hasOnline && hasHybrid) ? (
              <p className="text-xs text-gray-500 mt-1">
                Course supports multiple modes. Select one for this event.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Event price (optional)"
            />
            <Input
              label="Venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Event venue (optional)"
            />
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (optional)"
            />
            <Input
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State (optional)"
            />
          </div>
        </>
      )}

      <div className="flex space-x-4 pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={loading || !trainerId || (!hasInHouse && !hasPublic) || (!hasPhysical && !hasOnline && !hasHybrid) || selectedAvailabilityIds.length !== daysNeeded}
          className="flex-1"
        >
          {loading ? 'Creating Event...' : 'Create Event'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
      {((!hasInHouse && !hasPublic) || (!hasPhysical && !hasOnline && !hasHybrid)) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg mt-4">
          <p className="text-sm text-red-800">
            Cannot create event: Course must have at least one course type and one course mode set. Please edit the course first.
          </p>
        </div>
      )}
    </form>
  );
};
