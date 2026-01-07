import React, { useState, useEffect } from 'react';
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Course, Trainer } from '../../types';
import { apiClient } from '../../lib/api-client';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { ScheduleBuilder, ScheduleItemData } from './ScheduleBuilder';
import { COURSE_CATEGORIES } from '../../utils/categories';

interface CourseFormProps {
  course?: Course;
  onSubmit: (data: Partial<Course>, trainerIds: string[]) => Promise<void>;
  onCancel: () => void;
}

export const CourseForm: React.FC<CourseFormProps> = ({
  course,
  onSubmit,
  onCancel,
}) => {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [filteredTrainers, setFilteredTrainers] = useState<Trainer[]>([]);
  const [trainerSearchTerm, setTrainerSearchTerm] = useState('');
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    details: course ? true : true, // Always expand details when editing to show all trainer-filled fields
    schedule: course ? true : false,
    trainers: true,
  });
  const [scheduleItems, setScheduleItems] = useState<Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }>>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  // Helper to safely access course properties that might not be in the type definition
  const getCourseField = (field: string) => {
    const c = course as any;
    return c?.[field];
  };

  const [learningObjectives, setLearningObjectives] = useState<string[]>(() => {
    const c = course as any;
    if (Array.isArray(c?.learningObjectives)) return c.learningObjectives;
    if (Array.isArray(c?.learning_objectives)) return c.learning_objectives;
    if (typeof c?.learningObjectives === 'string') return c.learningObjectives.split('\n').filter((s: string) => s.trim());
    if (typeof c?.learning_objectives === 'string') return c.learning_objectives.split('\n').filter((s: string) => s.trim());
    return [''];
  });

  const [learningOutcomes, setLearningOutcomes] = useState<string[]>(() => {
    const c = course as any;
    if (Array.isArray(c?.learningOutcomes)) return c.learningOutcomes;
    if (Array.isArray(c?.learning_outcomes)) return c.learning_outcomes;
    if (typeof c?.learningOutcomes === 'string') return c.learningOutcomes.split('\n').filter((s: string) => s.trim());
    if (typeof c?.learning_outcomes === 'string') return c.learning_outcomes.split('\n').filter((s: string) => s.trim());
    return [''];
  });

  const [formData, setFormData] = useState({
    title: course?.title || '',
    description: course?.description || '',
    target_audience: getCourseField('targetAudience') || getCourseField('target_audience') || '',
    methodology: getCourseField('methodology') || '',
    prerequisite: getCourseField('prerequisite') || '',
    certificate: getCourseField('certificate') || '',
    professional_development_points: getCourseField('professionalDevelopmentPoints') || '',
    professional_development_points_other: getCourseField('professionalDevelopmentPointsOther') || '',
    assessment: getCourseField('assessment') || false,
    duration_hours: (getCourseField('durationHours') || getCourseField('duration_hours'))?.toString() || '',
    duration_unit: (getCourseField('durationUnit') || getCourseField('duration_unit') as 'days' | 'hours' | 'half_day') || 'hours',
    event_date: (() => {
      const c = course as any;
      if (c?.startDate) return c.startDate.split('T')[0];
      if (c?.start_date) return c.start_date.split('T')[0];
      if (c?.fixedDate) return c.fixedDate.split('T')[0];
      if (c?.event_date) return c.event_date;
      return '';
    })(),
    end_date: (() => {
      const c = course as any;
      if (c?.endDate) return c.endDate.split('T')[0];
      if (c?.end_date) return c.end_date.split('T')[0];
      return '';
    })(),
    category: getCourseField('category') || '',
    price: course?.price?.toString() || '',
    venue: course?.venue || '',
    hrdc_claimable: getCourseField('hrdcClaimable') || course?.hrdc_claimable || false,
    course_type: (() => {
      const c = course as any;
      const ct = c?.courseType || c?.course_type;
      if (Array.isArray(ct)) {
        if (ct.includes('IN_HOUSE') && ct.includes('PUBLIC')) return 'BOTH';
        if (ct.includes('PUBLIC')) return 'PUBLIC';
        return 'IN_HOUSE';
      }
      return ct || 'IN_HOUSE';
    })(),
    course_mode: (() => {
      const c = course as any;
      const cm = c?.courseMode || c?.course_mode;
      if (Array.isArray(cm)) return cm;
      return cm ? [cm] : ['PHYSICAL'];
    })(),
    city: getCourseField('city') || '',
    state: getCourseField('state') || '',
    status: (() => {
      const c = course as any;
      const status = c?.status || 'draft';
      // Normalize status to lowercase with underscore format for form handling
      return typeof status === 'string' ? status.toLowerCase().replace('_', ' ') : 'draft';
    })(),
    created_by_admin: getCourseField('createdByAdmin') !== undefined ? getCourseField('createdByAdmin') : (course?.created_by_admin ?? true),
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTrainers();
    if (course?.id) {
      fetchCourseTrainers();
      fetchCourseSchedule();
      // Update formData when course changes to ensure all fields are populated
      updateFormDataFromCourse();
    }
  }, [course?.id]); // Trigger when course ID changes

  // Separate useEffect to update formData and learning arrays when course data is loaded
  // This ensures fields populate when the course object is updated with API data
  useEffect(() => {
    if (course) {
      const c = course as any;
      
      // Update learning objectives array
      if (c?.learningObjectives !== undefined || c?.learning_objectives !== undefined) {
        let objectivesArray: string[] = [];
        if (Array.isArray(c.learningObjectives)) {
          objectivesArray = c.learningObjectives.filter((obj: string) => obj && obj.trim());
        } else if (Array.isArray(c.learning_objectives)) {
          objectivesArray = c.learning_objectives.filter((obj: string) => obj && obj.trim());
        } else if (typeof c.learningObjectives === 'string' && c.learningObjectives.trim()) {
          objectivesArray = c.learningObjectives.split('\n').filter((s: string) => s.trim());
        } else if (typeof c.learning_objectives === 'string' && c.learning_objectives.trim()) {
          objectivesArray = c.learning_objectives.split('\n').filter((s: string) => s.trim());
        }
        // Always update if we have data, or set to empty array if no data
        setLearningObjectives(objectivesArray.length > 0 ? objectivesArray : ['']);
      }

      // Update learning outcomes array
      if (c?.learningOutcomes !== undefined || c?.learning_outcomes !== undefined) {
        let outcomesArray: string[] = [];
        if (Array.isArray(c.learningOutcomes)) {
          outcomesArray = c.learningOutcomes.filter((out: string) => out && out.trim());
        } else if (Array.isArray(c.learning_outcomes)) {
          outcomesArray = c.learning_outcomes.filter((out: string) => out && out.trim());
        } else if (typeof c.learningOutcomes === 'string' && c.learningOutcomes.trim()) {
          outcomesArray = c.learningOutcomes.split('\n').filter((s: string) => s.trim());
        } else if (typeof c.learning_outcomes === 'string' && c.learning_outcomes.trim()) {
          outcomesArray = c.learning_outcomes.split('\n').filter((s: string) => s.trim());
        }
        // Always update if we have data, or set to empty array if no data
        setLearningOutcomes(outcomesArray.length > 0 ? outcomesArray : ['']);
      }

      // Update formData when course has detailed fields (indicating it's fully loaded from API)
      if (course.id && (c.learningObjectives !== undefined || c.learningOutcomes !== undefined || c.targetAudience !== undefined)) {
        updateFormDataFromCourse();
        // Also fetch trainers when course data is fully loaded (in case trainer assignments changed)
        fetchCourseTrainers();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, (course as any)?.learningObjectives, (course as any)?.learningOutcomes, (course as any)?.targetAudience, (course as any)?.courseTrainers, (course as any)?.trainerId]); // Trigger when detailed fields are loaded

  const updateFormDataFromCourse = () => {
    if (!course) return;

    const c = course as any;
    
    // Debug logging
    console.log('Updating formData from course:', {
      learningObjectives: c.learningObjectives,
      learningOutcomes: c.learningOutcomes,
      targetAudience: c.targetAudience,
      methodology: c.methodology,
      prerequisite: c.prerequisite,
    });

    // Handle learning objectives - can be array, string, or JSON
    let learningObjectivesValue = '';
    if (c.learningObjectives !== undefined && c.learningObjectives !== null) {
      if (Array.isArray(c.learningObjectives)) {
        learningObjectivesValue = c.learningObjectives.join('\n');
      } else if (typeof c.learningObjectives === 'string') {
        learningObjectivesValue = c.learningObjectives;
      } else if (typeof c.learningObjectives === 'object') {
        // Handle JSON object - try to parse
        try {
          const parsed = Array.isArray(c.learningObjectives) ? c.learningObjectives : JSON.parse(JSON.stringify(c.learningObjectives));
          learningObjectivesValue = Array.isArray(parsed) ? parsed.join('\n') : String(parsed);
        } catch {
          learningObjectivesValue = String(c.learningObjectives);
        }
      }
    } else if (c.learning_objectives !== undefined && c.learning_objectives !== null) {
      if (Array.isArray(c.learning_objectives)) {
        learningObjectivesValue = c.learning_objectives.join('\n');
      } else if (typeof c.learning_objectives === 'string') {
        learningObjectivesValue = c.learning_objectives;
      }
    }

    // Handle learning outcomes - can be array, string, or JSON
    let learningOutcomesValue = '';
    if (c.learningOutcomes !== undefined && c.learningOutcomes !== null) {
      if (Array.isArray(c.learningOutcomes)) {
        learningOutcomesValue = c.learningOutcomes.join('\n');
      } else if (typeof c.learningOutcomes === 'string') {
        learningOutcomesValue = c.learningOutcomes;
      } else if (typeof c.learningOutcomes === 'object') {
        try {
          const parsed = Array.isArray(c.learningOutcomes) ? c.learningOutcomes : JSON.parse(JSON.stringify(c.learningOutcomes));
          learningOutcomesValue = Array.isArray(parsed) ? parsed.join('\n') : String(parsed);
        } catch {
          learningOutcomesValue = String(c.learningOutcomes);
        }
      }
    } else if (c.learning_outcomes !== undefined && c.learning_outcomes !== null) {
      if (Array.isArray(c.learning_outcomes)) {
        learningOutcomesValue = c.learning_outcomes.join('\n');
      } else if (typeof c.learning_outcomes === 'string') {
        learningOutcomesValue = c.learning_outcomes;
      }
    }

    // Update learning objectives and outcomes arrays
    if (learningObjectivesValue !== '') {
      setLearningObjectives(learningObjectivesValue.split('\n').filter((s: string) => s.trim()).length > 0 
        ? learningObjectivesValue.split('\n').filter((s: string) => s.trim()) 
        : ['']);
    }
    if (learningOutcomesValue !== '') {
      setLearningOutcomes(learningOutcomesValue.split('\n').filter((s: string) => s.trim()).length > 0 
        ? learningOutcomesValue.split('\n').filter((s: string) => s.trim()) 
        : ['']);
    }

    // Always update values - use the value from course if it exists, otherwise keep prev
    setFormData(prev => {
      const updated = {
        ...prev,
        title: course.title || prev.title,
        description: course.description || prev.description,
        // For string fields, check if they exist in course, even if empty string
        target_audience: (c.targetAudience !== undefined) ? String(c.targetAudience || '') : ((c.target_audience !== undefined) ? String(c.target_audience || '') : prev.target_audience),
        methodology: (c.methodology !== undefined) ? String(c.methodology || '') : prev.methodology,
        prerequisite: (c.prerequisite !== undefined) ? String(c.prerequisite || '') : prev.prerequisite,
        category: (c.category !== undefined && c.category !== null) ? String(c.category) : prev.category,
        course_type: (c.courseType || c.course_type) || prev.course_type,
        course_mode: (c.courseMode || c.course_mode) || prev.course_mode,
        duration_hours: (c.durationHours || c.duration_hours) ? String(c.durationHours || c.duration_hours) : prev.duration_hours,
        duration_unit: (c.durationUnit || c.duration_unit as 'days' | 'hours' | 'half_day') || prev.duration_unit,
        city: (c.city !== undefined && c.city !== null) ? String(c.city) : prev.city,
        state: (c.state !== undefined && c.state !== null) ? String(c.state) : prev.state,
      };
      
      console.log('Updated formData:', {
        target_audience: updated.target_audience,
        methodology: updated.methodology,
        prerequisite: updated.prerequisite,
      });
      return updated;
    });
  };

  const fetchCourseSchedule = async () => {
    if (!course) return;

    setLoadingSchedule(true);
    try {
      const response = await apiClient.getCourseSchedule(course.id);
      const schedule = response.schedule || [];

      // Transform schedule items to match ScheduleBuilder format
      // Handle both old format (string) and new format (array)
      const scheduleWithSubmodules = schedule.reduce((acc: any[], item: any) => {
        // Parse module_title - can be string or array
        let moduleTitles: string[] = [];
        if (Array.isArray(item.moduleTitle)) {
          moduleTitles = item.moduleTitle;
        } else if (typeof item.moduleTitle === 'string' && item.moduleTitle) {
          moduleTitles = [item.moduleTitle];
        } else if (item.module_title) {
          // Handle snake_case from backend
          if (Array.isArray(item.module_title)) {
            moduleTitles = item.module_title;
          } else if (typeof item.module_title === 'string') {
            moduleTitles = [item.module_title];
          }
        }

        // Parse submodule_title - can be string, array, or null
        let submoduleTitles: string[] = [];
        if (Array.isArray(item.submoduleTitle)) {
          submoduleTitles = item.submoduleTitle;
        } else if (typeof item.submoduleTitle === 'string' && item.submoduleTitle) {
          submoduleTitles = [item.submoduleTitle];
        } else if (item.submodule_title) {
          // Handle snake_case from backend
          if (Array.isArray(item.submodule_title)) {
            submoduleTitles = item.submodule_title;
          } else if (typeof item.submodule_title === 'string') {
            submoduleTitles = [item.submodule_title];
          }
        }

        // Find existing item with same day and time
        const existingItem = acc.find(
          (i) =>
            i.day_number === item.dayNumber || i.day_number === item.day_number &&
            i.start_time === (item.startTime || item.start_time)
        );

        if (existingItem) {
          // Merge modules and submodules
          moduleTitles.forEach(moduleTitle => {
            if (moduleTitle && !existingItem.module_titles?.includes(moduleTitle)) {
              if (!existingItem.module_titles) existingItem.module_titles = [];
              existingItem.module_titles.push(moduleTitle);
            }
          });
          submoduleTitles.forEach(submoduleTitle => {
            if (submoduleTitle && !existingItem.submodules.includes(submoduleTitle)) {
              existingItem.submodules.push(submoduleTitle);
            }
          });
          // Update display module_title to first one
          if (moduleTitles.length > 0) {
            existingItem.module_title = moduleTitles[0];
          }
        } else {
          acc.push({
            id: item.id || `day-${item.dayNumber || item.day_number}-${item.startTime || item.start_time}`,
            day_number: item.dayNumber || item.day_number,
            start_time: item.startTime || item.start_time,
            end_time: item.endTime || item.end_time,
            module_title: moduleTitles[0] || '', // Display first module
            module_titles: moduleTitles, // All modules
            submodule_title: null,
            duration_minutes: item.durationMinutes || item.duration_minutes || 120,
            submodules: submoduleTitles,
          });
        }

        return acc;
      }, []);

      setScheduleItems(scheduleWithSubmodules);
    } catch (error) {
      console.error('Error loading course schedule:', error);
      setScheduleItems([]);
    } finally {
      setLoadingSchedule(false);
    }
  };


  const fetchTrainers = async () => {
    try {
      const response = await apiClient.getTrainers();
      // Map backend format to frontend format
      const mappedTrainers = (response.trainers || []).map((t: any) => ({
        id: t.id,
        user_id: t.userId || null,
        email: t.email || '',
        full_name: t.fullName || '',
        phone: t.phoneNumber || null,
        specialization: Array.isArray(t.areasOfExpertise) && t.areasOfExpertise.length > 0 
          ? t.areasOfExpertise[0] 
          : null,
        bio: t.professionalBio || null,
        hourly_rate: null,
        hrdc_certified: !!t.hrdcAccreditationId,
        created_at: t.createdAt || new Date().toISOString(),
        updated_at: t.updatedAt || new Date().toISOString(),
      }));
      setTrainers(mappedTrainers);
      setFilteredTrainers(mappedTrainers);
    } catch (error) {
      console.error('Error fetching trainers:', error);
    }
  };

  useEffect(() => {
    if (!trainerSearchTerm.trim()) {
      setFilteredTrainers(trainers);
    } else {
      const searchLower = trainerSearchTerm.toLowerCase();
      const filtered = trainers.filter(trainer => 
        trainer.full_name?.toLowerCase().includes(searchLower) ||
        trainer.id.toLowerCase().includes(searchLower) ||
        trainer.email?.toLowerCase().includes(searchLower) ||
        trainer.specialization?.toLowerCase().includes(searchLower)
      );
      setFilteredTrainers(filtered);
    }
  }, [trainerSearchTerm, trainers]);

  const fetchCourseTrainers = async () => {
    if (!course) return;

    try {
      // Always fetch full course data to get both trainer_id and courseTrainers relationship
      const response = await apiClient.getAdminCourse(course.id);
      const fullCourse = response.course;
      
      if (!fullCourse) return;

      const trainerIds: string[] = [];
      
      // Add trainer_id if it exists (for trainer-created courses)
      if (fullCourse.trainerId) {
        trainerIds.push(fullCourse.trainerId);
      }
      
      // Add trainers from courseTrainers relationship (for admin-assigned trainers)
      if (fullCourse.courseTrainers && Array.isArray(fullCourse.courseTrainers)) {
        fullCourse.courseTrainers.forEach((ct: any) => {
          const trainerId = ct.trainerId || ct.trainer?.id;
          if (trainerId && !trainerIds.includes(trainerId)) {
            trainerIds.push(trainerId);
          }
        });
      }
      
      setSelectedTrainerIds(trainerIds.length > 0 ? trainerIds : []);
    } catch (error) {
      console.error('Error fetching course trainers:', error);
      // Fallback: try to use course.trainer_id if available
      if (course.trainer_id) {
        setSelectedTrainerIds([course.trainer_id]);
      }
    }
  };

  const handleTrainerToggle = (trainerId: string) => {
    setSelectedTrainerIds(prev =>
      prev.includes(trainerId)
        ? prev.filter(id => id !== trainerId)
        : [...prev, trainerId]
    );
  };

  const toggleSection = (section: 'basic' | 'details' | 'schedule' | 'trainers') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Filter out empty learning objectives and outcomes
      const learningObjectivesArray = learningObjectives
        .map((obj: string) => obj.trim())
        .filter((obj: string) => obj.length > 0);

      const learningOutcomesArray = learningOutcomes
        .map((out: string) => out.trim())
        .filter((out: string) => out.length > 0);


      // Prepare schedule to save - use camelCase to match backend expectations
      const scheduleToSave: any[] = [];
      scheduleItems.forEach((item) => {
        // Get module titles - use new array format if available, otherwise use single module_title
        const moduleTitles = (item as any).module_titles && Array.isArray((item as any).module_titles) 
          ? (item as any).module_titles.filter((m: string) => m && m.trim())
          : (item.module_title && item.module_title.trim() ? [item.module_title] : []);

        // Only save if there's at least one module title
        if (moduleTitles.length > 0) {
          // Save one row per day/session with arrays
          scheduleToSave.push({
            dayNumber: item.day_number,
            startTime: item.start_time,
            endTime: item.end_time,
            moduleTitle: moduleTitles, // Array format
            submoduleTitle: item.submodules && item.submodules.length > 0 
              ? item.submodules.filter((s: string) => s && s.trim()) // Array format
              : null,
            durationMinutes: item.duration_minutes,
          });
        }
      });

      // Save course first
      const courseData: any = {
        title: formData.title,
        description: formData.description,
        learningObjectives: learningObjectivesArray.length > 0 ? learningObjectivesArray : null,
        learningOutcomes: learningOutcomesArray.length > 0 ? learningOutcomesArray : null,
        targetAudience: formData.target_audience || null,
        methodology: formData.methodology || null,
        prerequisite: formData.prerequisite || null,
        certificate: formData.certificate || null,
        assessment: formData.assessment,
        price: formData.price ? parseFloat(formData.price) : null,
        durationHours: formData.duration_hours ? Math.round(parseFloat(formData.duration_hours)) : null,
        durationUnit: formData.duration_unit,
        startDate: null,
        endDate: formData.end_date || null,
        fixedDate: null,
        venue: formData.venue || null,
        category: formData.category || null,
        hrdcClaimable: formData.hrdc_claimable,
        courseType: formData.course_type === 'BOTH' ? ['IN_HOUSE', 'PUBLIC'] : [formData.course_type],
        courseMode: Array.isArray(formData.course_mode) && formData.course_mode.length > 0 ? formData.course_mode : ['PHYSICAL'],
        professionalDevelopmentPoints: formData.professional_development_points || null,
        professionalDevelopmentPointsOther: formData.professional_development_points === 'OTHERS' ? formData.professional_development_points_other : null,
        status: formData.status.toUpperCase().replace(' ', '_') as any,
        createdByAdmin: formData.created_by_admin,
        trainerId: formData.created_by_admin ? null : (selectedTrainerIds[0] || null),
        city: formData.city || null,
        state: formData.state || null,
      };
      
      await onSubmit(
        courseData as Partial<Course>,
        formData.created_by_admin ? selectedTrainerIds : []
      );

      // Save schedule if course exists and schedule items are provided
      // For edit: course.id exists
      // For create: schedule will be saved after course is created (if needed in future)
      const courseId = course?.id;
      if (courseId && scheduleToSave.length > 0) {
        try {
          await apiClient.updateCourseSchedule(courseId, scheduleToSave);
        } catch (scheduleError) {
          console.error('Error saving schedule:', scheduleError);
          // Don't throw - schedule is optional, course was already saved
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card title={course ? 'Edit Course' : 'Create New Course'}>
        <div className="space-y-6">

          {/* Basic Information Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection('basic')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
              {expandedSections.basic ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {expandedSections.basic && (
              <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Input
            label="Course Title *"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            placeholder="Enter course title"
          />
        </div>

        <div className="md:col-span-2">
          <Textarea
            label="Description *"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={4}
            required
            placeholder="Brief description of the course"
          />
        </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <Select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      options={[
                        { value: '', label: 'Select a category' },
                        ...COURSE_CATEGORIES.map(cat => ({ value: cat, label: cat }))
                      ]}
          />
        </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Course Type *
                    </label>
                    <Select
                      value={formData.course_type}
                      onChange={(e) => setFormData({ ...formData, course_type: e.target.value })}
                      options={[
                        { value: 'IN_HOUSE', label: 'In-House only' },
                        { value: 'PUBLIC', label: 'Public only' },
                        { value: 'BOTH', label: 'In-House and Public' },
                      ]}
          />
        </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Course Mode * (Select all that apply)
                    </label>
                    <div className="space-y-2">
                      {['PHYSICAL', 'ONLINE', 'HYBRID'].map((mode) => (
                        <label key={mode} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Array.isArray(formData.course_mode) && formData.course_mode.includes(mode)}
                            onChange={(e) => {
                              const currentModes = Array.isArray(formData.course_mode) ? formData.course_mode : [];
                              if (e.target.checked) {
                                setFormData({ ...formData, course_mode: [...currentModes, mode] });
                              } else {
                                setFormData({ ...formData, course_mode: currentModes.filter((m: string) => m !== mode) });
                              }
                            }}
                            className="w-4 h-4 text-teal-600 rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {mode === 'ONLINE' ? 'Online' : mode === 'HYBRID' ? 'Hybrid' : mode}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Course Duration
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={formData.duration_unit}
                        onChange={(e) => {
                          const newUnit = e.target.value as 'days' | 'hours' | 'half_day';
                          // When half_day is selected, set duration to 5
                          if (newUnit === 'half_day') {
                            setFormData({ ...formData, duration_unit: newUnit, duration_hours: '5' });
                          } else {
                            setFormData({ ...formData, duration_unit: newUnit });
                          }
                        }}
                        options={[
                          { value: 'hours', label: 'Hours' },
                          { value: 'days', label: 'Days' },
                          { value: 'half_day', label: 'Half Day' },
                        ]}
                      />
        <Input
          type="number"
          value={formData.duration_unit === 'half_day' ? '5' : formData.duration_hours}
          onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                        placeholder="Duration"
                        min={formData.duration_unit === 'hours' ? 1 : 1}
                        max={formData.duration_unit === 'hours' ? 5 : undefined}
                        step={1}
                        disabled={formData.duration_unit === 'half_day'}
                        readOnly={formData.duration_unit === 'half_day'}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.duration_unit === 'hours' && '1-5 hours only'}
                      {formData.duration_unit === 'half_day' && 'Half day duration is fixed at 5 hours'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Certificate
                    </label>
        <Select
                      value={formData.certificate}
                      onChange={(e) => setFormData({ ...formData, certificate: e.target.value })}
          options={[
                        { value: '', label: 'Select certificate type' },
                        { value: 'CERTIFICATE_OF_ATTENDANCE', label: 'Certificate of Attendance' },
                        { value: 'PROFESSIONAL_CERTIFICATION', label: 'Professional Certification' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Professional Development Points
                    </label>
                    <Select
                      value={formData.professional_development_points}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        professional_development_points: e.target.value,
                        professional_development_points_other: e.target.value !== 'OTHERS' ? '' : formData.professional_development_points_other
                      })}
                      options={[
                        { value: '', label: 'Select PDP type' },
                        { value: 'MBOT-CPD', label: 'MBOT-CPD' },
                        { value: 'BEM-CPD', label: 'BEM-CPD' },
                        { value: 'DOSH-CEP', label: 'DOSH-CEP' },
                        { value: 'BOVAEA-CPD', label: 'BOVAEA-CPD' },
                        { value: 'CIDB-CCD', label: 'CIDB-CCD' },
                        { value: 'EC/ST-CDP', label: 'EC/ST-CDP' },
                        { value: 'OTHERS', label: 'Others' },
                      ]}
                    />
                    {formData.professional_development_points === 'OTHERS' && (
        <Input
                        label="Please specify"
                        value={formData.professional_development_points_other}
                        onChange={(e) => setFormData({ ...formData, professional_development_points_other: e.target.value })}
                        placeholder="Enter professional development points"
                        className="mt-2"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Assessment
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.assessment}
                        onChange={(e) => setFormData({ ...formData, assessment: e.target.checked })}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700">{formData.assessment ? 'Yes' : 'No'}</span>
                    </label>
                  </div>

                  {(parseFloat(formData.duration_hours) > 9 || formData.duration_unit === 'days') && (
                    <div>
        <Input
                        label="End Date (Optional)"
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Set the end date for multi-day courses
                      </p>
                    </div>
                  )}

        <Input
          label="Price (MYR)"
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          placeholder="Course price"
        />

        <Input
          label="Venue"
          value={formData.venue}
          onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
          placeholder="Training venue"
        />

        <Input
          label="City"
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          placeholder="City location"
        />

        <Input
                    label="State"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="State location"
                  />


        <Select
          label="Status *"
                    value={formData.status.toLowerCase().replace('_', ' ')}
                    onChange={(e) => {
                      const statusValue = e.target.value.toUpperCase().replace(' ', '_');
                      setFormData({ ...formData, status: statusValue as any });
                    }}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'pending_approval', label: 'Pending Approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'denied', label: 'Denied' },
          ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Course Details Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection('details')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900">Course Details</h3>
              {expandedSections.details ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {expandedSections.details && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Learning Objectives
                    </label>
                    <div className="space-y-2">
                      {learningObjectives.map((obj, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={obj}
                            onChange={(e) => {
                              const updated = [...learningObjectives];
                              updated[index] = e.target.value;
                              setLearningObjectives(updated);
                            }}
                            placeholder={`Learning objective ${index + 1}`}
                            className="flex-1"
                          />
                          {index === learningObjectives.length - 1 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setLearningObjectives([...learningObjectives, ''])}
                              title="Add another objective"
                            >
                              <Plus size={18} />
                            </Button>
                          )}
                          {learningObjectives.length > 1 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const updated = learningObjectives.filter((_, i) => i !== index);
                                if (updated.length === 0) updated.push('');
                                setLearningObjectives(updated);
                              }}
                              title="Remove this objective"
                              className="bg-red-100 hover:bg-red-200 text-red-700"
                            >
                              <X size={18} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Learning Outcomes
                    </label>
                    <div className="space-y-2">
                      {learningOutcomes.map((out, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={out}
                            onChange={(e) => {
                              const updated = [...learningOutcomes];
                              updated[index] = e.target.value;
                              setLearningOutcomes(updated);
                            }}
                            placeholder={`Learning outcome ${index + 1}`}
                            className="flex-1"
                          />
                          {index === learningOutcomes.length - 1 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setLearningOutcomes([...learningOutcomes, ''])}
                              title="Add another outcome"
                            >
                              <Plus size={18} />
                            </Button>
                          )}
                          {learningOutcomes.length > 1 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const updated = learningOutcomes.filter((_, i) => i !== index);
                                if (updated.length === 0) updated.push('');
                                setLearningOutcomes(updated);
                              }}
                              title="Remove this outcome"
                              className="bg-red-100 hover:bg-red-200 text-red-700"
                            >
                              <X size={18} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Textarea
                    label="Target Audience"
                    value={formData.target_audience}
                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                    rows={4}
                    placeholder="Who is this course for?"
                  />

                  <Textarea
                    label="Methodology"
                    value={formData.methodology}
                    onChange={(e) => setFormData({ ...formData, methodology: e.target.value })}
                    rows={4}
                    placeholder="Teaching methodology"
                  />

                  <Textarea
                    label="Prerequisite"
                    value={formData.prerequisite}
                    onChange={(e) => setFormData({ ...formData, prerequisite: e.target.value })}
          rows={4}
                    placeholder="Required prerequisites"
        />
      </div>

                <div className="flex items-center space-x-6 pt-4 border-t">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.hrdc_claimable}
              onChange={(e) => setFormData({ ...formData, hrdc_claimable: e.target.checked })}
              className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
            />
            <span className="text-sm font-medium text-gray-700">HRDC Claimable</span>
          </label>

          {!course && (
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.created_by_admin}
                onChange={(e) => setFormData({ ...formData, created_by_admin: e.target.checked })}
                className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700">Admin Created (Multiple Trainers)</span>
            </label>
          )}
        </div>
              </div>
            )}
          </div>

          {/* Course Schedule Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection('schedule')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900">Course Schedule (Optional)</h3>
              {expandedSections.schedule ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {expandedSections.schedule && (
              <div className="mt-4">
                {loadingSchedule ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600">Loading course schedule...</p>
                  </div>
                ) : (
                  <ScheduleBuilder
                    scheduleItems={scheduleItems}
                    onChange={setScheduleItems}
                    requiredDurationHours={formData.duration_hours ? parseFloat(formData.duration_hours) : 1}
                    durationUnit={formData.duration_unit as 'days' | 'hours' | 'half_day'}
                  />
                )}
              </div>
            )}
      </div>

          {/* Trainer Assignment Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection('trainers')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900">
          {formData.created_by_admin || course?.created_by_admin ? 'Assign Trainers (Multiple)' : 'Assign Trainer (Single)'}
              </h3>
              {expandedSections.trainers ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {expandedSections.trainers && (
              <div className="mt-4 space-y-4">
                <div>
                  <Input
                    placeholder="Search trainers by name, ID, or email..."
                    value={trainerSearchTerm}
                    onChange={(e) => setTrainerSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
        <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                  {filteredTrainers.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {trainerSearchTerm ? 'No trainers found matching your search' : 'No trainers available'}
                    </p>
                  ) : (
                    filteredTrainers.map((trainer) => (
              <div key={trainer.id} className="flex items-center">
                <input
                  type={formData.created_by_admin || course?.created_by_admin ? 'checkbox' : 'radio'}
                  id={`trainer-${trainer.id}`}
                  checked={selectedTrainerIds.includes(trainer.id)}
                  onChange={() => {
                    if (formData.created_by_admin || course?.created_by_admin) {
                      handleTrainerToggle(trainer.id);
                    } else {
                      setSelectedTrainerIds([trainer.id]);
                    }
                  }}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                />
                <label htmlFor={`trainer-${trainer.id}`} className="ml-2 text-sm text-gray-700">
                  {trainer.full_name} - {trainer.specialization || 'No specialization'}
                </label>
              </div>
            ))
          )}
        </div>
      </div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end space-x-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving...' : course ? 'Update Course' : 'Create Course'}
        </Button>
      </div>
    </form>
  );
};
