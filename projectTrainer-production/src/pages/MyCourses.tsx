import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Save, Send, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { CourseBasicInfoForm } from '../components/courses/CourseBasicInfoForm';
import { ScheduleBuilder } from '../components/courses/ScheduleBuilder';
import { CourseListTable } from '../components/courses/CourseListTable';
import {
  createCourse,
  updateCourse,
  fetchTrainerCourses,
  saveCourseSchedule,
  fetchCourseSchedule,
  deleteCourse,
  validateScheduleDuration,
  validateWordLimit,
  CourseFormData,
  ScheduleItemData
} from '../lib/courseService';
import { Course } from '../types/database';

interface FormData {
  title: string;
  duration_hours: number;
  duration_unit: 'days' | 'hours' | 'half_day';
  course_type: string | null;
  course_mode: string | null;
  category: string | null;
  certificate: string | null;
  assessment: boolean;
  description: string;
  learning_objectives: string[];
  learning_outcomes: string[];
  target_audience: string;
  methodology: string;
  prerequisite: string;
  end_date: string | null;
}

const initialFormData: FormData = {
  title: '',
  duration_hours: 9,
  duration_unit: 'days',
  course_type: null,
  course_mode: null,
  category: null,
  certificate: null,
  assessment: false,
  description: '',
  learning_objectives: [''],
  learning_outcomes: [''],
  target_audience: '',
      methodology: '',
      prerequisite: '',
      end_date: null
    };

export function MyCourses() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [scheduleItems, setScheduleItems] = useState<Array<ScheduleItemData & { id: string; submodules: string[]; module_titles?: string[] }>>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.id) {
      loadCourses();
    }
  }, [user]);

  const loadCourses = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const data = await fetchTrainerCourses(user.id);
      setCourses(data);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (course: Course) => {
    setEditingCourse(course);

    setFormData({
      title: course.title,
      duration_hours: course.duration_hours,
      duration_unit: course.duration_unit,
      course_type: course.course_type || null,
      course_mode: course.course_mode || null,
      category: course.category || null,
      certificate: course.certificate,
      assessment: course.assessment,
      description: course.description || '',
      learning_objectives: course.learning_objectives && course.learning_objectives.length > 0 ? course.learning_objectives : [''],
      learning_outcomes: course.learning_outcomes && course.learning_outcomes.length > 0 ? course.learning_outcomes : [''],
      target_audience: course.target_audience || '',
      methodology: course.methodology || '',
      prerequisite: course.prerequisite || '',
      end_date: course.end_date || null
    });

    try {
      const schedule = await fetchCourseSchedule(course.id);
      // Handle both old format (string) and new format (array)
      const scheduleWithSubmodules = schedule.reduce((acc: any[], item) => {
        // Parse module_title - can be string or array
        let moduleTitles: string[] = [];
        if (Array.isArray(item.module_title)) {
          moduleTitles = item.module_title;
        } else if (typeof item.module_title === 'string' && item.module_title) {
          moduleTitles = [item.module_title];
        }

        // Parse submodule_title - can be string, array, or null
        let submoduleTitles: string[] = [];
        if (Array.isArray(item.submodule_title)) {
          submoduleTitles = item.submodule_title;
        } else if (typeof item.submodule_title === 'string' && item.submodule_title) {
          submoduleTitles = [item.submodule_title];
        }

        // Find existing item with same day and time
        const existingItem = acc.find(
          i => i.day_number === item.day_number &&
               i.start_time === item.start_time
        );

        if (existingItem) {
          // Merge modules and submodules
          moduleTitles.forEach(moduleTitle => {
            if (moduleTitle && !existingItem.module_titles.includes(moduleTitle)) {
              existingItem.module_titles.push(moduleTitle);
            }
          });
          submoduleTitles.forEach(submoduleTitle => {
            if (submoduleTitle && !existingItem.submodules.includes(submoduleTitle)) {
              existingItem.submodules.push(submoduleTitle);
            }
          });
        } else {
          acc.push({
            id: item.id,
            day_number: item.day_number,
            start_time: item.start_time,
            end_time: item.end_time,
            module_title: moduleTitles[0] || '', // Keep for backward compatibility
            module_titles: moduleTitles, // New array format
            submodule_title: null,
            duration_minutes: item.duration_minutes,
            submodules: submoduleTitles
          });
        }

        return acc;
      }, []);

      setScheduleItems(scheduleWithSubmodules);
    } catch (error) {
      console.error('Error loading schedule:', error);
      setScheduleItems([]);
    }

    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (courseId: string) => {
    try {
      await deleteCourse(courseId);
      await loadCourses();
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Failed to delete course');
    }
  };

  const validateForm = (isPublishing: boolean): boolean => {
    const newErrors: Record<string, string> = {};

    // Basic validation (always required)
    if (!formData.title.trim()) {
      newErrors.title = 'Course name is required';
    }

    if (!formData.course_type || formData.course_type.trim() === '') {
      newErrors.course_type = 'Please select a course type';
    }

    if (!validateWordLimit(formData.description, 250)) {
      newErrors.description = 'Introduction must be 250 words or less';
    }

    const validObjectives = formData.learning_objectives.filter(obj => obj.trim());
    if (validObjectives.some(obj => !validateWordLimit(obj, 50))) {
      newErrors.learning_objectives = 'Each objective must be 50 words or less';
    }

    const validOutcomes = formData.learning_outcomes.filter(out => out.trim());
    if (validOutcomes.some(out => !validateWordLimit(out, 20))) {
      newErrors.learning_outcomes = 'Each outcome must be 20 words or less';
    }

    // For publishing, all fields except prerequisites must be filled
    if (isPublishing) {
      if (!formData.description.trim()) {
        newErrors.description = 'Introduction is required for publishing';
      }

      if (validObjectives.length === 0) {
        newErrors.learning_objectives = 'At least one learning objective is required for publishing';
      }

      if (validOutcomes.length === 0) {
        newErrors.learning_outcomes = 'At least one learning outcome is required for publishing';
      }

      if (!formData.target_audience.trim()) {
        newErrors.target_audience = 'Target audience is required for publishing';
      }

      if (!formData.methodology.trim()) {
        newErrors.methodology = 'Methodology is required for publishing';
      }

      if (!formData.category || formData.category.trim() === '') {
        newErrors.category = 'Category is required for publishing';
      }

      if (!formData.certificate || formData.certificate.trim() === '') {
        newErrors.certificate = 'Certificate type is required for publishing';
      }

      if (formData.duration_hours <= 0) {
        newErrors.duration_hours = 'Duration must be greater than 0';
      }

      // Schedule validation removed - no longer required
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      console.log('Validation errors found:', newErrors);
      console.log('Form data:', {
        title: formData.title,
        course_type: formData.course_type,
        description_words: formData.description.trim().split(/\s+/).length,
        objectives_count: validObjectives.length,
        outcomes_count: validOutcomes.length,
        target_audience: formData.target_audience,
        methodology: formData.methodology,
        category: formData.category,
        certificate: formData.certificate,
      });
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (status: 'draft' | 'published') => {
    if (!user?.id) return;

    if (!validateForm(status === 'published')) {
      alert('Please fix the validation errors before saving');
      return;
    }

    setSaving(true);
    let courseId: string | null = null;
    let courseCreatedOrUpdated = false;

    try {
      // When editing, preserve the original status if user is just updating without changing status
      // But if they explicitly choose to publish or save as draft, use that choice
      const finalStatus = editingCourse && editingCourse.status === 'published' && status === 'published'
        ? 'published' // Keep published if already published and user clicks publish
        : status; // Otherwise use the selected status

      const courseData: CourseFormData = {
        title: formData.title,
        description: formData.description,
        duration_hours: formData.duration_hours,
        duration_unit: formData.duration_unit,
        course_type: formData.course_type,
        course_mode: formData.course_mode,
        category: formData.category,
        certificate: formData.certificate,
        assessment: formData.assessment,
        learning_objectives: formData.learning_objectives.filter(obj => obj.trim()),
        learning_outcomes: formData.learning_outcomes.filter(out => out.trim()),
        target_audience: formData.target_audience,
        methodology: formData.methodology,
        prerequisite: formData.prerequisite,
        end_date: formData.end_date || null,
        status: finalStatus,
      };

      // Step 1: Create or update course
      try {
        if (editingCourse) {
          console.log('Updating course:', editingCourse.id);
          const updated = await updateCourse(editingCourse.id, courseData);
          courseId = updated.id;
          courseCreatedOrUpdated = true;
          console.log('Course updated successfully');
        } else {
          console.log('Creating new course');
          const created = await createCourse(user.id, courseData);
          courseId = created.id;
          courseCreatedOrUpdated = true;
          console.log('Course created successfully with ID:', courseId);
        }
      } catch (courseError) {
        console.error('Failed to save course:', courseError);
        throw new Error(`Course save failed: ${courseError instanceof Error ? courseError.message : 'Unknown error'}`);
      }

      // Step 2: Save schedule if provided
      // Only save items that have a module_title (filter out empty/untitled modules)
      if (scheduleItems.length > 0 && courseId) {
        try {
          console.log('Saving schedule with', scheduleItems.length, 'items');
          const scheduleToSave: ScheduleItemData[] = [];

          scheduleItems.forEach(item => {
            // Get module titles - use new array format if available, otherwise use single module_title
            const moduleTitles = (item as any).module_titles && Array.isArray((item as any).module_titles) 
              ? (item as any).module_titles.filter((m: string) => m && m.trim())
              : (item.module_title && item.module_title.trim() ? [item.module_title] : []);

            // Only save if there's at least one module title
            if (moduleTitles.length > 0) {
              // Save one row per day/session with arrays
              scheduleToSave.push({
                day_number: item.day_number,
                start_time: item.start_time,
                end_time: item.end_time,
                module_title: moduleTitles, // Array format
                submodule_title: item.submodules && item.submodules.length > 0 
                  ? item.submodules.filter((s: string) => s && s.trim()) // Array format
                  : null,
                duration_minutes: item.duration_minutes
              });
            }
          });

          if (scheduleToSave.length > 0) {
            await saveCourseSchedule(courseId, scheduleToSave);
            console.log('Schedule saved successfully');
          } else {
            console.log('No valid schedule items to save (all modules are empty)');
          }
        } catch (scheduleError) {
          console.error('Failed to save schedule:', scheduleError);
          throw new Error(`Schedule save failed: ${scheduleError instanceof Error ? scheduleError.message : 'Unknown error'}. Course was saved but schedule was not.`);
        }
      }

      // Step 3: Show success message only if everything succeeded
      const successMessage = status === 'published'
        ? 'Course published successfully!'
        : 'Course saved as draft!';

      alert(successMessage);

      // Step 4: Reset form and reload
      setFormData(initialFormData);
      setScheduleItems([]);
      setEditingCourse(null);
      setShowForm(false);
      await loadCourses();

    } catch (error) {
      console.error('Error in handleSave:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save course. Please try again.';

      // Provide context about what succeeded/failed
      if (courseCreatedOrUpdated && error instanceof Error && error.message.includes('schedule')) {
        alert(`Course saved, but there was an issue with the schedule:\n${errorMessage}\n\nYou can edit the course to add the schedule later.`);
        // Still reload to show the saved course
        setFormData(initialFormData);
        setScheduleItems([]);
        setEditingCourse(null);
        setShowForm(false);
        await loadCourses();
      } else {
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNewCourse = () => {
    setEditingCourse(null);
    setFormData(initialFormData);
    setScheduleItems([]);
    setErrors({});
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
          <p className="text-gray-600 mt-1">Create and manage your training programs</p>
        </div>
        {!showForm && (
          <Button variant="primary" onClick={handleNewCourse}>
            <Plus className="w-4 h-4 mr-2" />
            Create Course
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingCourse ? 'Edit Course' : 'Create New Course'}
              </h2>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingCourse(null);
                  setFormData(initialFormData);
                  setScheduleItems([]);
                  setErrors({});
                }}
              >
                {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                {showForm ? 'Cancel' : 'Show Form'}
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <CourseBasicInfoForm
                  formData={formData}
                  onChange={setFormData}
                  errors={errors}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Course Schedule (Optional)</h3>
                <ScheduleBuilder
                  scheduleItems={scheduleItems}
                  onChange={setScheduleItems}
                  requiredDurationHours={formData.duration_hours}
                  durationUnit={formData.duration_unit}
                />
                {errors.schedule && (
                  <p className="mt-2 text-sm text-red-600">{errors.schedule}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => handleSave('draft')}
                  disabled={saving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleSave('published')}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoadingSpinner />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Publish Course
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <CourseListTable
        courses={courses}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRefresh={loadCourses}
      />
    </div>
  );
}
