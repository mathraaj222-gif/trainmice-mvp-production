import { useState, useEffect } from 'react';
import { X, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Course, CourseSchedule } from '../../types/database';
import { fetchCourseSchedule } from '../../lib/courseService';

interface CourseScheduleModalProps {
  course: Course;
  onClose: () => void;
}

export function CourseScheduleModal({ course, onClose }: CourseScheduleModalProps) {
  const [schedule, setSchedule] = useState<CourseSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchedule();
  }, [course.id]);

  const loadSchedule = async () => {
    try {
      const data = await fetchCourseSchedule(course.id);
      setSchedule(data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to format time (convert 24h to 12h format)
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  };
  
  // Helper to get session name from time
  const getSessionName = (startTime: string) => {
    const [hours] = startTime.split(':').map(Number);
    if (hours >= 9 && hours < 11) return 'Session 1';
    if (hours >= 11 && hours < 14) return 'Session 2';
    if (hours >= 14 && hours < 16) return 'Session 3';
    if (hours >= 16 && hours < 18) return 'Session 4';
    return 'Session';
  };

  // Group schedule items by day, then by session (grouping submodules under modules)
  // Only include items that have a module_title (filter out empty/untitled modules)
  const groupByDayAndSession = (items: any[]) => {
    const grouped: Record<number, Array<{
      day_number: number;
      start_time: string;
      end_time: string;
      module_title: string;
      module_titles: string[];
      submodules: string[];
    }>> = {};
    
    items.forEach(item => {
      // Handle both old format (string) and new format (array)
      const moduleTitles = (item.module_titles && Array.isArray(item.module_titles))
        ? item.module_titles.filter((m: string) => m && m.trim())
        : (item.module_title && typeof item.module_title === 'string' && item.module_title.trim() 
          ? [item.module_title] 
          : []);
      
      const submodules = (item.submodules && Array.isArray(item.submodules))
        ? item.submodules.filter((s: string) => s && s.trim())
        : (item.submodule_title && typeof item.submodule_title === 'string' && item.submodule_title.trim()
          ? [item.submodule_title]
          : []);

      // Only process items with at least one module title
      if (moduleTitles.length === 0) return;

      if (!grouped[item.day_number]) {
        grouped[item.day_number] = [];
      }
      
      // Find existing session with same day and time
      const existing = grouped[item.day_number].find(
        s => s.start_time === item.start_time && 
             s.end_time === item.end_time
      );
      
      if (existing) {
        // Merge module titles and submodules
        moduleTitles.forEach((moduleTitle: string) => {
          if (!existing.module_titles.includes(moduleTitle)) {
            existing.module_titles.push(moduleTitle);
          }
        });
        submodules.forEach((submodule: string) => {
          if (!existing.submodules.includes(submodule)) {
            existing.submodules.push(submodule);
          }
        });
        // Update display module_title to first one
        existing.module_title = existing.module_titles[0] || '';
      } else {
        // Create new session entry
        grouped[item.day_number].push({
          day_number: item.day_number,
          start_time: item.start_time,
          end_time: item.end_time,
          module_title: moduleTitles[0] || '', // Display first module
          module_titles: moduleTitles, // All modules
          submodules: submodules
        });
      }
    });
    
    // Sort items within each day by start_time
    Object.keys(grouped).forEach(day => {
      grouped[parseInt(day)].sort((a, b) => {
        const timeA = a.start_time.split(':').map(Number);
        const timeB = b.start_time.split(':').map(Number);
        const minutesA = timeA[0] * 60 + timeA[1];
        const minutesB = timeB[0] * 60 + timeB[1];
        return minutesA - minutesB;
      });
    });
    
    // Remove days that have no items after filtering
    Object.keys(grouped).forEach(day => {
      if (grouped[parseInt(day)].length === 0) {
        delete grouped[parseInt(day)];
      }
    });
    
    return grouped;
  };

  const groupedSchedule = groupByDayAndSession(schedule);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Course Schedule</h2>
              <p className="text-sm text-gray-600 mt-1">{course.title}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : schedule.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Schedule Available</h3>
              <p className="text-gray-600">
                This course doesn't have a schedule yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSchedule)
                .sort(([dayA], [dayB]) => parseInt(dayA) - parseInt(dayB))
                .map(([day, items]) => (
                  <div key={day} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Day {day}
                    </h3>

                    <div className="space-y-4">
                      {items.map((item, index) => {
                        const sessionName = getSessionName(item.start_time);
                        return (
                          <div key={`${item.day_number}-${item.start_time}-${item.module_title}-${index}`} className="border-l-4 border-blue-500 bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                                    {sessionName}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {formatTime(item.start_time)} - {formatTime(item.end_time)}
                                  </span>
                                </div>
                                <h4 className="font-medium text-gray-900">
                                  {item.module_titles && item.module_titles.length > 0
                                    ? item.module_titles.join(', ')
                                    : item.module_title}
                                </h4>
                              </div>
                            </div>

                            {item.submodules.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="space-y-1">
                                  {item.submodules.map((submodule, subIndex) => (
                                    <p key={subIndex} className="text-sm text-gray-700">
                                      <span className="text-gray-500 mr-2">•</span> {submodule}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
