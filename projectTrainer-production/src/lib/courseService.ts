import { apiClient } from './api-client';
import { Course, CourseSchedule, CourseMaterial } from '../types/database';

export interface CourseFormData {
  title: string;
  description: string;
  duration_hours: number;
  duration_unit?: 'days' | 'hours' | 'half_day';
  course_type: string | null;
  course_mode: string[] | string | null;
  category?: string | null;
  certificate: string | null;
  professional_development_points?: string | null;
  professional_development_points_other?: string | null;
  assessment: boolean;
  learning_objectives: string[];
  learning_outcomes: string[];
  target_audience: string;
  methodology: string;
  prerequisite: string;
  end_date?: string | null;
  status: 'draft' | 'published';
}

export interface ScheduleItemData {
  day_number: number;
  start_time: string;
  end_time: string;
  module_title: string | string[]; // Can be string (backward compat) or array
  submodule_title: string | string[] | null; // Can be string (backward compat) or array
  duration_minutes: number;
}

// Map frontend CourseFormData → backend Course payload
function mapToBackendCourse(trainerId: string, courseData: CourseFormData) {
  // Trainers cannot set fixedDate - events are created only by admin
  // Only set startDate and endDate if end_date is provided
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  const fixedDate: Date | null = null; // Always null for trainer-created courses

  // Handle end_date if provided
  if (courseData.end_date && courseData.end_date.trim() !== '') {
    // If end_date is provided, we can optionally set startDate
    // For now, we'll leave startDate null unless explicitly provided
    endDate = new Date(courseData.end_date);
  }

  // Store the raw value based on unit - no conversion
  // The form now stores raw values: days as days, hours as hours, half_day as 4.5 hours
  let storedDurationHours: number;
  if (courseData.duration_unit === 'days') {
    // For days, duration_hours contains the raw day count (e.g., 2 for 2 days)
    // Store it as-is
    storedDurationHours = courseData.duration_hours;
  } else if (courseData.duration_unit === 'half_day') {
    // Half day is stored as 4.5 hours
    storedDurationHours = 4.5;
  } else {
    // For hours, use the value as-is (raw hour count)
    storedDurationHours = courseData.duration_hours;
  }

  return {
    trainerId,
    title: courseData.title,
    description: courseData.description,
    durationHours: storedDurationHours,
    durationUnit: courseData.duration_unit || 'hours',
    courseType: courseData.course_type === 'BOTH' 
      ? ['IN_HOUSE', 'PUBLIC']
      : courseData.course_type
      ? [courseData.course_type.toUpperCase().replace('-', '_')]
      : ['IN_HOUSE'],
    courseMode: Array.isArray(courseData.course_mode) && courseData.course_mode.length > 0
      ? courseData.course_mode.map(m => m.toUpperCase())
      : courseData.course_mode
      ? [courseData.course_mode.toUpperCase()]
      : ['PHYSICAL'],
    category: courseData.category || null,
    certificate: courseData.certificate || null,
    professionalDevelopmentPoints: courseData.professional_development_points || null,
    professionalDevelopmentPointsOther: courseData.professional_development_points === 'OTHERS' 
      ? courseData.professional_development_points_other || null
      : null,
    assessment: courseData.assessment,
    learningObjectives: courseData.learning_objectives,
    learningOutcomes: courseData.learning_outcomes,
    targetAudience: courseData.target_audience,
    methodology: courseData.methodology,
    prerequisite: courseData.prerequisite,
      fixedDate: null, // Trainers cannot set fixedDate
    startDate,
    endDate,
    status: courseData.status === 'published' ? 'ACTIVE' : 'DRAFT',
    modules: [],
    trainerAvailabilityId: courseData.selectedAvailabilityId || null,
  };
}

export async function createCourse(trainerId: string, courseData: CourseFormData) {
  try {
    const payload = mapToBackendCourse(trainerId, courseData);
    const result = await apiClient.post<{ course: any }>('/courses', payload);
    return result.course as Course;
  } catch (error: any) {
    console.error('Error creating course:', error);
    throw new Error(error?.message || 'Failed to create course');
  }
}

export async function updateCourse(courseId: string, courseData: Partial<CourseFormData>) {
  try {
    // For updates, we need to handle partial data differently
    // Only include fields that are explicitly provided
    const updatePayload: any = {};
    
    // Map only provided fields
    if (courseData.title !== undefined) updatePayload.title = courseData.title;
    if (courseData.description !== undefined) updatePayload.description = courseData.description;
    if (courseData.duration_hours !== undefined) updatePayload.durationHours = courseData.duration_hours;
    if (courseData.duration_unit !== undefined) updatePayload.durationUnit = courseData.duration_unit;
    if (courseData.course_type !== undefined) {
      // course_type is now an array
      if (Array.isArray(courseData.course_type)) {
        updatePayload.courseType = courseData.course_type.map((t: string) => 
          t.toUpperCase().replace('-', '_')
        );
      } else if (courseData.course_type) {
        // Handle single value case for backward compatibility
        updatePayload.courseType = [courseData.course_type.toUpperCase().replace('-', '_')];
      } else {
        updatePayload.courseType = null;
      }
    }
    if (courseData.course_mode !== undefined) {
      // course_mode is now an array
      if (Array.isArray(courseData.course_mode)) {
        updatePayload.courseMode = courseData.course_mode.map((m: string) => 
          m.toUpperCase().replace('VIRTUAL', 'ONLINE').replace('BOTH', 'HYBRID')
        );
      } else if (courseData.course_mode) {
        // Handle single value case for backward compatibility
        const mode = courseData.course_mode.toUpperCase().replace('VIRTUAL', 'ONLINE').replace('BOTH', 'HYBRID');
        updatePayload.courseMode = [mode];
      } else {
        updatePayload.courseMode = null;
      }
    }
    if (courseData.professional_development_points !== undefined) {
      updatePayload.professionalDevelopmentPoints = courseData.professional_development_points;
    }
    if (courseData.professional_development_points_other !== undefined) {
      updatePayload.professionalDevelopmentPointsOther = courseData.professional_development_points_other;
    }
    if (courseData.category !== undefined) updatePayload.category = courseData.category;
    if (courseData.certificate !== undefined) updatePayload.certificate = courseData.certificate;
    if (courseData.assessment !== undefined) updatePayload.assessment = courseData.assessment;
    if (courseData.learning_objectives !== undefined) updatePayload.learningObjectives = courseData.learning_objectives;
    if (courseData.learning_outcomes !== undefined) updatePayload.learningOutcomes = courseData.learning_outcomes;
    if (courseData.target_audience !== undefined) updatePayload.targetAudience = courseData.target_audience;
    if (courseData.methodology !== undefined) updatePayload.methodology = courseData.methodology;
    if (courseData.prerequisite !== undefined) updatePayload.prerequisite = courseData.prerequisite;
    if (courseData.status !== undefined) {
      updatePayload.status = courseData.status === 'published' ? 'ACTIVE' : 'DRAFT';
    }
    
    // Handle end_date (trainers cannot set fixedDate - events created only by admin)
    if (courseData.end_date !== undefined && courseData.end_date && courseData.end_date.trim() !== '') {
      updatePayload.endDate = new Date(courseData.end_date);
    } else if (courseData.end_date !== undefined && (!courseData.end_date || courseData.end_date.trim() === '')) {
      updatePayload.endDate = null;
    }
    
    // Ensure fixedDate is always null for trainer updates
    if (courseData.event_date !== undefined) {
      updatePayload.fixedDate = null;
    }

    const result = await apiClient.put<{ course: any }>(`/courses/${courseId}`, updatePayload);
    return result.course as Course;
  } catch (error: any) {
    console.error('Error updating course:', error);
    throw new Error(error?.message || 'Failed to update course');
  }
}

export async function fetchTrainerCourses(trainerId: string) {
  try {
    const result = await apiClient.get<{ courses: any[] }>(`/courses?trainerId=${encodeURIComponent(trainerId)}`);
    // Map backend camelCase fields into existing Course shape used by UI
    return (result.courses || []).map((raw) => {
      // Convert duration back to original unit for display
      const durationUnit = raw.durationUnit ?? raw.duration_unit ?? 'hours';
      let durationHours = raw.durationHours;
      
      // If unit is days, the stored value is already in days (not hours)
      // So we use it directly without conversion
      // The stored value for days is the raw day count (e.g., 2 for 2 days)
      // The stored value for hours is the raw hour count (e.g., 6 for 6 hours)
      // No conversion needed - use the stored value as-is

      return {
        id: raw.id,
        trainer_id: raw.trainerId,
        title: raw.title,
        description: raw.description ?? null,
        learning_objectives: raw.learningObjectives ?? [],
        learning_outcomes: raw.learningOutcomes ?? [],
        target_audience: raw.targetAudience ?? null,
        methodology: raw.methodology ?? null,
        prerequisite: raw.prerequisite ?? null,
        certificate: raw.certificate ?? null,
        professional_development_points: raw.professionalDevelopmentPoints ?? null,
        professional_development_points_other: raw.professionalDevelopmentPointsOther ?? null,
        assessment: raw.assessment ?? false,
        course_type: Array.isArray(raw.courseType) ? raw.courseType : (raw.courseType ? [raw.courseType] : null),
        course_mode: Array.isArray(raw.courseMode) ? raw.courseMode : (raw.courseMode ? [raw.courseMode] : null),
        duration_hours: durationHours,
        duration_unit: durationUnit,
        event_date: raw.fixedDate ? new Date(raw.fixedDate).toISOString().split('T')[0] : (raw.startDate ? new Date(raw.startDate).toISOString().split('T')[0] : null),
        end_date: raw.endDate ? new Date(raw.endDate).toISOString().split('T')[0] : null,
        category: raw.category ?? null,
        price: raw.price ?? null,
        venue: raw.venue ?? null,
        hrdc_claimable: raw.hrdcClaimable ?? null,
        modules: raw.modules ?? [],
        // Map backend status to frontend status
        // DRAFT -> 'draft', PENDING_APPROVAL -> 'draft' (trainer sees rejected courses as draft)
        // APPROVED -> 'published' (approved courses are published)
        status: raw.status === 'APPROVED' ? 'published' : 'draft',
        course_sequence: null,
        created_at: raw.createdAt,
      };
    }) as Course[];
  } catch (error: any) {
    console.error('Error fetching trainer courses:', error);
    throw new Error(error?.message || 'Failed to load courses');
  }
}

export async function fetchCourseById(courseId: string) {
  try {
    const result = await apiClient.get<{ course: any }>(`/courses/${courseId}`);
    const raw = result.course;
    if (!raw) return null;
    return {
      id: raw.id,
      trainer_id: raw.trainerId,
      title: raw.title,
      description: raw.description ?? null,
      learning_objectives: raw.learningObjectives ?? [],
      learning_outcomes: raw.learningOutcomes ?? [],
      target_audience: raw.targetAudience ?? null,
      methodology: raw.methodology ?? null,
      prerequisite: raw.prerequisite ?? null,
      certificate: raw.certificate ?? null,
      professional_development_points: raw.professionalDevelopmentPoints ?? null,
      professional_development_points_other: raw.professionalDevelopmentPointsOther ?? null,
      assessment: raw.assessment ?? false,
      course_type: Array.isArray(raw.courseType) ? raw.courseType : (raw.courseType ? [raw.courseType] : null),
      course_mode: Array.isArray(raw.courseMode) ? raw.courseMode : (raw.courseMode ? [raw.courseMode] : null),
      duration_hours: raw.durationHours,
      duration_unit: 'hours',
      event_date: raw.fixedDate ? new Date(raw.fixedDate).toISOString().split('T')[0] : null,
      category: raw.category ?? null,
      price: raw.price ?? null,
      venue: raw.venue ?? null,
      hrdc_claimable: raw.hrdcClaimable ?? null,
      modules: raw.modules ?? [],
      status: raw.status === 'ACTIVE' ? 'published' : 'draft',
      course_sequence: null,
      created_at: raw.createdAt,
    } as Course;
  } catch (error: any) {
    console.error('Error fetching course by id:', error);
    throw new Error(error?.message || 'Failed to load course');
  }
}

export async function deleteCourse(courseId: string) {
  try {
    await apiClient.delete(`/courses/${courseId}`);
  } catch (error: any) {
    console.error('Error deleting course:', error);
    throw new Error(error?.message || 'Failed to delete course');
  }
}

export async function saveCourseSchedule(courseId: string, scheduleItems: ScheduleItemData[]) {
  try {
    const payload = scheduleItems.map((item) => {
      // Ensure module_title is an array
      const moduleTitleArray = Array.isArray(item.module_title) 
        ? item.module_title 
        : (item.module_title ? [item.module_title] : []);
      
      // Ensure submodule_title is an array or null
      let submoduleTitleArray: string[] | null = null;
      if (item.submodule_title) {
        if (Array.isArray(item.submodule_title)) {
          submoduleTitleArray = item.submodule_title;
        } else {
          submoduleTitleArray = [item.submodule_title];
        }
      }

      return {
        dayNumber: item.day_number,
        startTime: item.start_time,
        endTime: item.end_time,
        moduleTitle: moduleTitleArray,
        submoduleTitle: submoduleTitleArray,
        durationMinutes: item.duration_minutes,
      };
    });
    const result = await apiClient.put<{ schedule: any[] }>(`/courses/${courseId}/schedule`, {
      items: payload,
    });
    return (result.schedule || []).map((s) => {
      // Parse arrays from backend response
      const moduleTitle = Array.isArray(s.moduleTitle) ? s.moduleTitle : (s.moduleTitle ? [s.moduleTitle] : []);
      const submoduleTitle = Array.isArray(s.submoduleTitle) 
        ? s.submoduleTitle 
        : (s.submoduleTitle ? [s.submoduleTitle] : null);

      return {
        id: s.id,
        course_id: s.courseId,
        day_number: s.dayNumber,
        start_time: s.startTime,
        end_time: s.endTime,
        module_title: moduleTitle.length > 0 ? moduleTitle[0] : '', // Backward compat
        module_titles: moduleTitle, // New format
        submodule_title: submoduleTitle && submoduleTitle.length > 0 ? submoduleTitle[0] : null, // Backward compat
        submodules: submoduleTitle || [], // New format
        duration_minutes: s.durationMinutes,
        created_at: s.createdAt,
      };
    }) as any[];
  } catch (error: any) {
    console.error('Failed to save schedule:', error);
    throw new Error(error?.message || 'Failed to save schedule');
  }
}

export async function fetchCourseSchedule(courseId: string) {
  try {
    const result = await apiClient.get<{ course: any }>(`/courses/${courseId}`);
    const schedule = result.course?.courseSchedule || [];
    return schedule.map((s: any) => {
      // Parse arrays from backend - handle both old (string) and new (array) formats
      const moduleTitle = Array.isArray(s.moduleTitle) ? s.moduleTitle : (s.moduleTitle ? [s.moduleTitle] : []);
      const submoduleTitle = Array.isArray(s.submoduleTitle) 
        ? s.submoduleTitle 
        : (s.submoduleTitle ? [s.submoduleTitle] : null);

      return {
        id: s.id,
        course_id: s.courseId,
        day_number: s.dayNumber,
        start_time: s.startTime,
        end_time: s.endTime,
        module_title: moduleTitle.length > 0 ? moduleTitle[0] : '', // Backward compat
        module_titles: moduleTitle, // New format
        submodule_title: submoduleTitle && submoduleTitle.length > 0 ? submoduleTitle[0] : null, // Backward compat
        submodules: submoduleTitle || [], // New format
        duration_minutes: s.durationMinutes,
        created_at: s.createdAt,
      };
    }) as any[];
  } catch (error: any) {
    console.error('Error fetching course schedule:', error);
    throw new Error(error?.message || 'Failed to load course schedule');
  }
}

export async function uploadCourseMaterial(
  courseId: string,
  file: File
): Promise<CourseMaterial> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const result = await apiClient.post<{ material: any }>(`/courses/${courseId}/materials`, formData);
    const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD 
      ? window.location.origin + '/api'
      : 'http://localhost:3000/api');
    const baseUrl = API_BASE_URL.replace('/api', ''); // Remove /api to get base server URL
    
    return {
      id: result.material.id,
      course_id: result.material.courseId,
      file_url: result.material.fileUrl?.startsWith('http') ? result.material.fileUrl : `${baseUrl}${result.material.fileUrl}`,
      file_name: result.material.fileName,
      uploaded_at: result.material.uploadedAt,
    } as CourseMaterial;
  } catch (error: any) {
    console.error('Error uploading course material:', error);
    throw new Error(error?.message || 'Failed to upload course material');
  }
}

export async function fetchCourseMaterials(courseId: string) {
  try {
    const result = await apiClient.get<{ course: any }>(`/courses/${courseId}`);
    const mats = result.course?.courseMaterials || [];
    const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD 
      ? window.location.origin + '/api'
      : 'http://localhost:3000/api');
    const baseUrl = API_BASE_URL.replace('/api', ''); // Remove /api to get base server URL
    
    return mats.map((m: any) => ({
      id: m.id,
      course_id: m.courseId,
      file_url: m.fileUrl?.startsWith('http') ? m.fileUrl : `${baseUrl}${m.fileUrl}`,
      file_name: m.fileName,
      uploaded_at: m.uploadedAt,
    })) as CourseMaterial[];
  } catch (error: any) {
    console.error('Error fetching course materials:', error);
    throw new Error(error?.message || 'Failed to load course materials');
  }
}

export async function deleteCourseMaterial(courseId: string, materialId: string) {
  try {
    await apiClient.delete(`/courses/${courseId}/materials/${materialId}`);
  } catch (error: any) {
    console.error('Error deleting course material:', error);
    throw new Error(error?.message || 'Failed to delete course material');
  }
}

export function calculateDurationInMinutes(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);

  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  return endTotalMinutes - startTotalMinutes;
}

export function validateScheduleDuration(
  scheduleItems: ScheduleItemData[],
  requiredDurationHours: number
): boolean {
  const totalMinutes = scheduleItems.reduce((sum, item) => sum + item.duration_minutes, 0);
  const requiredMinutes = requiredDurationHours * 60;
  return totalMinutes === requiredMinutes;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function validateWordLimit(text: string, maxWords: number): boolean {
  const wordCount = countWords(text);
  return wordCount <= maxWords;
}
