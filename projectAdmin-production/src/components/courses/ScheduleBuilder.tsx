import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface ScheduleItemData {
  day_number: number;
  start_time: string;
  end_time: string;
  module_title: string | string[]; // Can be string (backward compat) or array
  submodule_title: string | string[] | null; // Can be string (backward compat) or array
  duration_minutes: number;
}

interface ScheduleBuilderProps {
  scheduleItems: Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }>;
  onChange: (items: Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }>) => void;
  requiredDurationHours: number;
  durationUnit: 'days' | 'hours' | 'half_day';
}

// Updated session times
const FULL_DAY_SESSIONS = [
  { name: 'Session 1', startTime: '09:00', endTime: '11:00' },
  { name: 'Session 2', startTime: '11:00', endTime: '14:00' },
  { name: 'Session 3', startTime: '14:00', endTime: '16:00' },
  { name: 'Session 4', startTime: '16:00', endTime: '18:00' },
];

// Half day sessions (first 2 sessions)
const HALF_DAY_SESSIONS = [
  { name: 'Session 1', startTime: '09:00', endTime: '11:00' },
  { name: 'Session 2', startTime: '11:00', endTime: '14:00' },
];

// Hours sessions (1 or 2 sessions based on hours)
const HOUR_SESSIONS = [
  { name: 'Session 1', startTime: '09:00', endTime: '11:00' },
  { name: 'Session 2', startTime: '11:00', endTime: '14:00' },
];

export function ScheduleBuilder({ scheduleItems, onChange, requiredDurationHours, durationUnit }: ScheduleBuilderProps) {
  // Determine which sessions to show and how many days
  const getSessionsAndDays = () => {
    if (durationUnit === 'half_day') {
      return { sessions: HALF_DAY_SESSIONS, daysCount: 1 };
    } else if (durationUnit === 'days') {
      // duration_hours now contains the raw day count (e.g., 2 for 2 days)
      // Use it directly without conversion
      const daysCount = requiredDurationHours > 0 ? Math.round(requiredDurationHours) : 1;
      return { sessions: FULL_DAY_SESSIONS, daysCount };
    } else {
      // For hours: show 1 session if <= 2 hours, 2 sessions if > 2 hours
      const sessionsCount = requiredDurationHours > 2 ? 2 : 1;
      return {
        sessions: HOUR_SESSIONS.slice(0, sessionsCount),
        daysCount: 1
      };
    }
  };

  const { sessions, daysCount } = getSessionsAndDays();

  // Initialize schedule structure if empty
  const initializeSchedule = () => {
    const newItems: Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }> = [];

    for (let day = 1; day <= daysCount; day++) {
      sessions.forEach((session, sessionIndex) => {
        // Calculate duration in minutes (standardized: 2 hours per session)
        const durationMinutes = 120; // 2 hours = 120 minutes

        newItems.push({
          id: `day-${day}-session-${sessionIndex}`,
          day_number: day,
          start_time: session.startTime,
          end_time: session.endTime,
          module_title: '', // Keep for backward compatibility
          module_titles: [], // New array format
          submodule_title: null,
          duration_minutes: durationMinutes,
          submodules: [],
        });
      });
    }

    onChange(newItems);
  };

  // Get or create item for a specific day and session
  const getItem = (day: number, sessionIndex: number) => {
    const session = sessions[sessionIndex];
    const item = scheduleItems.find(
      (item) => item.day_number === day && item.start_time === session.startTime
    );

    if (!item) {
      const durationMinutes = 120; // Standardized 2 hours
      const newItem: ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] } = {
        id: `day-${day}-session-${sessionIndex}`,
        day_number: day,
        start_time: session.startTime,
        end_time: session.endTime,
        module_title: '', // Keep for backward compatibility
        module_titles: [], // New array format
        submodule_title: null,
        duration_minutes: durationMinutes,
        submodules: [],
      };

      const updatedItems = [...scheduleItems, newItem];
      onChange(updatedItems);
      return newItem;
    }

    return item;
  };

  const updateItem = (day: number, sessionIndex: number, updates: Partial<ScheduleItemData & { submodules: string[] }>) => {
    const session = sessions[sessionIndex];
    const updatedItems = scheduleItems.map((item) => {
      if (item.day_number === day && item.start_time === session.startTime) {
        return { ...item, ...updates };
      }
      return item;
    });
    onChange(updatedItems);
  };

  const addSubmodule = (day: number, sessionIndex: number) => {
    const item = getItem(day, sessionIndex);
    updateItem(day, sessionIndex, {
      submodules: [...item.submodules, ''],
    });
  };

  const removeSubmodule = (day: number, sessionIndex: number, submoduleIndex: number) => {
    const item = getItem(day, sessionIndex);
    updateItem(day, sessionIndex, {
      submodules: item.submodules.filter((_, i) => i !== submoduleIndex),
    });
  };

  const updateSubmodule = (day: number, sessionIndex: number, submoduleIndex: number, value: string) => {
    const item = getItem(day, sessionIndex);
    const newSubmodules = [...item.submodules];
    newSubmodules[submoduleIndex] = value;
    updateItem(day, sessionIndex, { submodules: newSubmodules });
  };

  // Initialize if empty (but only if we have duration info)
  React.useEffect(() => {
    if (scheduleItems.length === 0 && requiredDurationHours > 0) {
      initializeSchedule();
    }
  }, [requiredDurationHours, durationUnit]);

  if (scheduleItems.length === 0 && requiredDurationHours > 0) {
    return null; // Will initialize via useEffect
  }

  if (scheduleItems.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No schedule items yet. Set course duration to create schedule.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {Array.from({ length: daysCount }, (_, dayIndex) => {
          const day = dayIndex + 1;
          return (
            <div key={day} className="border border-gray-200 rounded-lg p-6 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Day {day}</h3>

              <div className="space-y-4">
                {sessions.map((session, sessionIndex) => {
                  const item = getItem(day, sessionIndex);

                  return (
                    <div key={sessionIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">
                          {session.name} ({session.startTime} - {session.endTime})
                        </h4>
                      </div>

                      <div className="space-y-3">
                        <Input
                          label="Module Title"
                          value={item.module_title || ''}
                          onChange={(e) => {
                            const moduleTitle = e.target.value;
                            // Update both old format (for backward compatibility) and new array format
                            updateItem(day, sessionIndex, { 
                              module_title: moduleTitle,
                              module_titles: moduleTitle ? [moduleTitle] : []
                            });
                          }}
                          placeholder={`Enter module title for ${session.name}`}
                        />

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">Submodules (Optional)</label>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => addSubmodule(day, sessionIndex)}
                              className="text-xs py-1 px-2"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Submodule
                            </Button>
                          </div>

                          {item.submodules.length > 0 && (
                            <div className="space-y-2">
                              {item.submodules.map((submodule, submoduleIndex) => (
                                <div key={submoduleIndex} className="flex gap-2">
                                  <Input
                                    value={submodule}
                                    onChange={(e) => updateSubmodule(day, sessionIndex, submoduleIndex, e.target.value)}
                                    placeholder={`Submodule ${submoduleIndex + 1}`}
                                  />
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => removeSubmodule(day, sessionIndex, submoduleIndex)}
                                    className="px-2"
                                  >
                                    <span className="text-red-600">×</span>
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

