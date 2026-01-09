import React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScheduleItemData } from '../../lib/courseService';

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

// New structure: Module with submodules
interface ModuleData {
  id: string;
  moduleTitle: string;
  submodules: string[]; // Array of submodule strings
}

// Session data: contains multiple modules
interface SessionData {
  dayNumber: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  modules: ModuleData[];
}

export function ScheduleBuilder({ scheduleItems, onChange, requiredDurationHours, durationUnit }: ScheduleBuilderProps) {
  // Determine which sessions to show and how many days
  const getSessionsAndDays = () => {
    if (durationUnit === 'half_day') {
      return { sessions: HALF_DAY_SESSIONS, daysCount: 1 };
    } else if (durationUnit === 'days') {
      const daysCount = requiredDurationHours > 0 ? Math.round(requiredDurationHours) : 1;
      return { sessions: FULL_DAY_SESSIONS, daysCount };
    } else {
      const sessionsCount = requiredDurationHours > 2 ? 2 : 1;
      return { 
        sessions: HOUR_SESSIONS.slice(0, sessionsCount), 
        daysCount: 1 
      };
    }
  };

  const { sessions, daysCount } = getSessionsAndDays();

  // Convert scheduleItems to grouped structure by day and session
  const groupScheduleBySession = (): Map<string, SessionData> => {
    const sessionMap = new Map<string, SessionData>();

    // Initialize all sessions
    for (let day = 1; day <= daysCount; day++) {
      sessions.forEach((session) => {
        const key = `${day}-${session.startTime}`;
        sessionMap.set(key, {
          dayNumber: day,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: 120,
          modules: [],
        });
      });
    }

    // Group existing schedule items by day and session
    scheduleItems.forEach((item) => {
      const key = `${item.day_number}-${item.start_time}`;
      const session = sessionMap.get(key);
      if (session) {
        // moduleTitle is now a string (one module per row)
        // Include all modules, even with empty titles (for newly added modules)
        const moduleTitle = typeof item.module_title === 'string' ? item.module_title : '';
        // Get submodules from item
        const submodules = Array.isArray(item.submodules) ? item.submodules : [];
        
        session.modules.push({
          id: item.id || `module-${Date.now()}-${Math.random()}`,
          moduleTitle,
          submodules,
        });
      }
    });

    return sessionMap;
  };

  // Convert grouped structure back to flat scheduleItems
  const flattenSchedule = (sessionMap: Map<string, SessionData>) => {
    const items: Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }> = [];
    
    sessionMap.forEach((session) => {
      session.modules.forEach((module) => {
        items.push({
          id: module.id,
          day_number: session.dayNumber,
          start_time: session.startTime,
          end_time: session.endTime,
          module_title: module.moduleTitle,
          submodule_title: module.submodules.length > 0 ? module.submodules : null,
          duration_minutes: session.durationMinutes,
          submodules: module.submodules,
        });
      });
    });

    return items;
  };

  const addModule = (day: number, startTime: string) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      session.modules.push({
        id: `module-${Date.now()}-${Math.random()}`,
        moduleTitle: '',
        submodules: [],
      });
      onChange(flattenSchedule(currentMap));
    }
  };

  const removeModule = (day: number, startTime: string, moduleId: string) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      session.modules = session.modules.filter(m => m.id !== moduleId);
      onChange(flattenSchedule(currentMap));
    }
  };

  const updateModuleTitle = (day: number, startTime: string, moduleId: string, title: string) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      const module = session.modules.find(m => m.id === moduleId);
      if (module) {
        module.moduleTitle = title;
        onChange(flattenSchedule(currentMap));
      }
    }
  };

  const addSubmodule = (day: number, startTime: string, moduleId: string) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      const module = session.modules.find(m => m.id === moduleId);
      if (module) {
        module.submodules.push('');
        onChange(flattenSchedule(currentMap));
      }
    }
  };

  const removeSubmodule = (day: number, startTime: string, moduleId: string, submoduleIndex: number) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      const module = session.modules.find(m => m.id === moduleId);
      if (module) {
        module.submodules = module.submodules.filter((_, i) => i !== submoduleIndex);
        onChange(flattenSchedule(currentMap));
      }
    }
  };

  const updateSubmodule = (day: number, startTime: string, moduleId: string, submoduleIndex: number, value: string) => {
    const currentMap = groupScheduleBySession();
    const key = `${day}-${startTime}`;
    const session = currentMap.get(key);
    if (session) {
      const module = session.modules.find(m => m.id === moduleId);
      if (module) {
        module.submodules[submoduleIndex] = value;
        onChange(flattenSchedule(currentMap));
      }
    }
  };

  const sessionMap = groupScheduleBySession();

  // Initialize if empty (but only if we have duration info)
  React.useEffect(() => {
    if (scheduleItems.length === 0 && requiredDurationHours > 0) {
      const initialMap = groupScheduleBySession();
      // Add one empty module per session to start
      initialMap.forEach((session) => {
        session.modules.push({
          id: `module-${Date.now()}-${Math.random()}`,
          moduleTitle: '',
          submodules: [],
        });
      });
      onChange(flattenSchedule(initialMap));
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
      {Array.from({ length: daysCount }, (_, dayIndex) => {
        const day = dayIndex + 1;
        return (
          <div key={day} className="border border-gray-200 rounded-lg p-6 bg-white">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Day {day}</h3>
            
            <div className="space-y-4">
              {sessions.map((session) => {
                const key = `${day}-${session.startTime}`;
                const sessionData = sessionMap.get(key);
                const modules = sessionData?.modules || [];

                return (
                  <div key={session.startTime} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">
                        {session.name} ({session.startTime} - {session.endTime})
                      </h4>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addModule(day, session.startTime)}
                        className="text-xs py-1 px-2"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Module
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {modules.map((module, moduleIndex) => (
                        <div key={module.id} className="border border-gray-300 rounded-lg p-3 bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Module {moduleIndex + 1}</span>
                            {modules.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeModule(day, session.startTime, module.id)}
                                className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          <Input
                            label="Module Title"
                            value={module.moduleTitle}
                            onChange={(e) => updateModuleTitle(day, session.startTime, module.id, e.target.value)}
                            placeholder="Enter module title"
                            className="mb-3"
                          />

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-medium text-gray-700">Submodules</label>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => addSubmodule(day, session.startTime, module.id)}
                                className="text-xs py-1 px-2"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Submodule
                              </Button>
                            </div>

                            <div className="space-y-2">
                              {module.submodules.map((submodule, submoduleIndex) => (
                                <div key={submoduleIndex} className="flex gap-2">
                                  <Input
                                    value={submodule}
                                    onChange={(e) => updateSubmodule(day, session.startTime, module.id, submoduleIndex, e.target.value)}
                                    placeholder={`Submodule ${submoduleIndex + 1}`}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => removeSubmodule(day, session.startTime, module.id, submoduleIndex)}
                                    className="px-2"
                                  >
                                    <X className="w-4 h-4 text-red-600" />
                                  </Button>
                                </div>
                              ))}
                              {module.submodules.length === 0 && (
                                <p className="text-sm text-gray-500 italic">No submodules added</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
