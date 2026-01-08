/**
 * API Client for TrainMICE Backend
 * Replaces Supabase client with REST API calls to MySQL backend
 */

// Get API URL from environment variable
// In production, VITE_API_URL must be set
// In development, falls back to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD 
  ? window.location.origin + '/api'  // Fallback to same origin in production
  : 'http://localhost:3000/api');    // Development fallback

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    // Load token from localStorage on initialization
    this.token = localStorage.getItem('token');
  }

  /**
   * Set authentication token
   */
  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  /**
   * Get authentication token
   */
  getToken(): string | null {
    return this.token || localStorage.getItem('token');
  }

  /**
   * Make API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Request failed: ${response.statusText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        // Token expired or invalid, clear it
        this.setToken(null);
        // Redirect to login or trigger auth state change
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...(this.getToken() && { Authorization: `Bearer ${this.getToken()}` }),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Client Signup (Company Email Only)
   */
  async clientSignup(data: {
    email: string;
    password: string;
    fullName?: string;
    userName?: string;
    contactNumber?: string;
    position?: string;
    companyName?: string;
    companyAddress?: string;
    city?: string;
    state?: string;
  }) {
    return this.post<{ message: string; user: any; requiresVerification: boolean }>('/auth/client/signup', data);
  }

  /**
   * Resend Verification Email
   */
  async resendVerification(email: string) {
    return this.post<{ message: string }>('/auth/resend-verification', { email });
  }

  /**
   * Get current client profile
   */
  async getClientProfile() {
    return this.get<{ client: any }>('/auth/client/profile');
  }

  /**
   * Register new user (Legacy - for backward compatibility)
   */
  async register(data: {
    email: string;
    password: string;
    fullName?: string;
    role: 'CLIENT' | 'TRAINER' | 'ADMIN';
    contactNumber?: string;
    userName?: string;
  }) {
    const response = await this.post<{ user: any; token: string; message: string }>('/auth/register', data);
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  /**
   * Login user
   */
  async login(email: string, password: string) {
    const response = await this.post<{ user: any; token: string; message: string }>('/auth/login', {
      email,
      password,
    });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  /**
   * Logout user
   */
  logout() {
    this.setToken(null);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  /**
   * Get current user
   */
  async getCurrentUser() {
    try {
      const response = await this.get<{ user: any }>('/auth/me');
      return response.user;
    } catch (error) {
      this.setToken(null);
      return null;
    }
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string) {
    return this.post<{ message: string }>('/auth/forgot-password', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, password: string) {
    return this.post<{ message: string }>('/auth/reset-password', { token, password });
  }

  // ============================================================================
  // COURSES METHODS
  // ============================================================================

  private mapCourse(raw: any): any {
    if (!raw) return raw;

    // Determine event_date: use fixedDate if available, otherwise use startDate
    let event_date = raw.fixedDate ?? raw.event_date ?? null;
    if (!event_date && raw.startDate) {
      event_date = raw.startDate;
    }

    // Map fixedDate to both fixed_date and event_date for compatibility
    const fixed_date = raw.fixedDate ?? raw.fixed_date ?? null;

    // Duration is stored as raw input value, so use as-is
    const durationUnit = raw.durationUnit ?? raw.duration_unit ?? 'hours';
    const durationHours = raw.durationHours ?? raw.duration_hours ?? null;

    return {
      ...raw,
      // Legacy / Supabase-style fields expected by existing frontend
      trainer_id: raw.trainerId ?? raw.trainer_id ?? null,
      course_type: Array.isArray(raw.courseType) ? raw.courseType : (raw.courseType ? [raw.courseType] : null),
      course_mode: Array.isArray(raw.courseMode) ? raw.courseMode : (raw.courseMode ? [raw.courseMode] : null),
      duration_hours: durationHours,
      duration_unit: durationUnit,
      fixed_date, // Map fixedDate to fixed_date for CourseDetail page
      event_date,
      start_date: raw.startDate ?? raw.start_date ?? null,
      end_date: raw.endDate ?? raw.end_date ?? null,
      hrdc_claimable: raw.hrdcClaimable ?? raw.hrdc_claimable ?? false,
      brochure_url: raw.brochureUrl ?? raw.brochure_url ?? null,
      course_code: raw.courseCode ?? raw.course_code ?? null,
      created_by: raw.createdBy ?? raw.created_by ?? null,
      course_rating: raw.courseRating ?? raw.course_rating ?? null, // Rating from feedbacks table
      // Map additional fields for CourseDetail page
      learning_objectives: raw.learningObjectives ?? raw.learning_objectives ?? [],
      learning_outcomes: raw.learningOutcomes ?? raw.learning_outcomes ?? null,
      target_audience: raw.targetAudience ?? raw.target_audience ?? null,
      methodology: raw.methodology ?? null,
      prerequisite: raw.prerequisite ?? null,
      certificate: raw.certificate ?? null,
      professional_development_points: raw.professionalDevelopmentPoints ?? raw.professional_development_points ?? null,
      professional_development_points_other: raw.professionalDevelopmentPointsOther ?? raw.professional_development_points_other ?? null,
      assessment: raw.assessment ?? false,
    };
  }

  /**
   * Get all courses
   */
  async getCourses(params?: { courseType?: string; status?: string; trainerId?: string }) {
    const response = await this.get<{ courses: any[] }>('/courses', params);
    return (response.courses || []).map((c) => this.mapCourse(c));
  }

  /**
   * Get single course
   */
  async getCourse(id: string) {
    const response = await this.get<{ course: any }>(`/courses/${id}`);
    return this.mapCourse(response.course);
  }

  // ============================================================================
  // TRAINERS METHODS
  // ============================================================================

  private mapTrainer(raw: any): any {
    if (!raw) return raw;

    return {
      ...raw,
      // Legacy / Supabase-style fields
      full_name: raw.fullName ?? raw.full_name ?? null, // May be null for public access
      profile_pic: raw.profilePic ?? raw.profile_pic ?? null,
      rating: raw.avgRating ?? raw.rating ?? null,
      custom_trainer_id: raw.customTrainerId ?? raw.custom_trainer_id ?? raw.id,
      professional_bio: raw.professionalBio ?? raw.professional_bio ?? null,
      state: raw.state ?? null,
      // Include qualifications, workHistory, and pastClients from backend
      qualifications: raw.qualifications ?? [],
      workHistory: raw.workHistoryEntries ?? raw.workHistory ?? [],
      pastClients: raw.pastClients ?? [],
    };
  }

  /**
   * Get all trainers
   */
  async getTrainers() {
    const response = await this.get<{ trainers: any[] }>('/trainers');
    return (response.trainers || []).map((t) => this.mapTrainer(t));
  }

  /**
   * Get single trainer
   */
  async getTrainer(id: string) {
    const response = await this.get<{ trainer: any }>(`/trainers/${id}`);
    return this.mapTrainer(response.trainer);
  }

  // ============================================================================
  // AVAILABILITY METHODS
  // ============================================================================

  private mapAvailability(raw: any): any {
    if (!raw) return raw;

    // Normalize status to lowercase strings used in the calendar helpers
    const status = String(raw.status || '').toUpperCase();
    let normalizedStatus: string;
    switch (status) {
      case 'AVAILABLE':
        normalizedStatus = 'available';
        break;
      case 'TENTATIVE':
        normalizedStatus = 'tentative';
        break;
      case 'BOOKED':
        normalizedStatus = 'booked';
        break;
      default:
        normalizedStatus = 'unavailable';
        break;
    }

    // Normalize date to YYYY-MM-DD format for consistent mapping
    let normalizedDate: string | null = null;
    if (raw.date) {
      // Check if already in YYYY-MM-DD format
      if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        normalizedDate = raw.date;
      } else {
        // Handle Date object, ISO string, or other formats
        const dateObj = raw.date instanceof Date ? raw.date : new Date(raw.date);
        if (!isNaN(dateObj.getTime())) {
          // Format as YYYY-MM-DD (use UTC to avoid timezone issues)
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getUTCDate()).padStart(2, '0');
          normalizedDate = `${year}-${month}-${day}`;
        } else {
          // If date parsing fails, try to extract YYYY-MM-DD from string
          const match = String(raw.date).match(/(\d{4}-\d{2}-\d{2})/);
          normalizedDate = match ? match[1] : null;
        }
      }
    }

    return {
      ...raw,
      // Legacy-style fields expected by calendarHelpers
      start_time: raw.startTime ?? raw.start_time ?? null,
      end_time: raw.endTime ?? raw.end_time ?? null,
      status: normalizedStatus,
      date: normalizedDate, // Ensure date is in YYYY-MM-DD format
    };
  }

  /**
   * Get trainer availability
   */
  async getTrainerAvailability(
    trainerId: string,
    params?: { month?: number; year?: number; startDate?: string; endDate?: string; courseId?: string }
  ) {
    const response = await this.get<{ availability: any[]; pendingCounts?: Record<string, number>; tentativeCounts?: Record<string, number> }>(
      `/availability/trainer/${trainerId}`,
      params
    );
    return {
      availability: (response.availability || []).map((a) => this.mapAvailability(a)),
      pendingCounts: response.pendingCounts || {},
      tentativeCounts: response.tentativeCounts || {},
    };
  }

  // ============================================================================
  // BOOKING METHODS
  // ============================================================================

  /**
   * Get booking requests
   */
  async getBookingRequests() {
    const response = await this.get<{ bookingRequests: any[] }>('/bookings');
    return response.bookingRequests;
  }

  /**
   * Create booking request
   */
  async createBookingRequest(data: any) {
    const response = await this.post<{ bookingRequest: any }>('/bookings', data);
    return response.bookingRequest;
  }

  // ============================================================================
  // EVENTS (Fixed Date Courses)
  // ============================================================================

  /**
   * Get events (for trainers)
   */
  async getEvents(params?: { trainerId?: string; courseId?: string; status?: string }) {
    return this.get<{ events: any[] }>('/events', params);
  }

  /**
   * Get single event
   */
  async getEvent(eventId: string) {
    return this.get<{ event: any }>(`/events/${eventId}`);
  }

  /**
   * Create event from course (for courses with fixed_date)
   */
  async createEventFromCourse(courseId: string) {
    return this.post<{ event: any }>(`/events/create-from-course`, { courseId });
  }

  /**
   * Register for event (Book Now - fixed date course registration)
   * If eventId is null, backend will create event from course's fixed_date
   */
  async registerForEvent(eventId: string | null, courseId: string, data?: { clientName?: string; clientEmail?: string }) {
    if (eventId) {
      return this.post<{ registration: any; message: string }>(`/events/${eventId}/register`, data);
    } else {
      // Register directly with course - backend will create event if needed
      return this.post<{ registration: any; message: string }>(`/events/register-from-course`, {
        courseId,
        ...data,
      });
    }
  }

  /**
   * Update booking status
   */
  async updateBookingStatus(id: string, status: string) {
    const response = await this.put<{ bookingRequest: any }>(`/bookings/${id}/status`, { status });
    return response.bookingRequest;
  }

  // ============================================================================
  // CONTACT METHODS
  // ============================================================================

  /**
   * Submit contact form
   */
  async submitContact(data: { name: string; email: string; phone?: string; message: string }) {
    const response = await this.post<{ submission: any; message: string }>('/contact/submit', data);
    return response;
  }

  // ============================================================================
  // CUSTOM REQUESTS METHODS
  // ============================================================================

  /**
   * Get custom course requests
   */
  async getCustomRequests() {
    const response = await this.get<{ requests: any[] }>('/custom-requests');
    return response.requests;
  }

  /**
   * Create custom course request
   */
  async createCustomRequest(data: any) {
    const response = await this.post<{ request: any }>('/custom-requests', data);
    return response.request;
  }

  // ============================================================================
  // FEEDBACK METHODS
  // ============================================================================

  /**
   * Get feedback form data for an event
   */
  async getFeedbackForm(eventId: string) {
    const response = await this.get<{ event: any }>(`/feedback/form/${eventId}`);
    return response.event;
  }

  /**
   * Submit feedback
   */
  async submitFeedback(data: any) {
    const response = await this.post<{ message: string; feedback: any }>('/feedback/submit', data);
    return response;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types (will be updated to match backend response types)
export type Course = any;
export type Trainer = any;
export type TrainerAvailability = any;
export type BookingRequest = any;
export type Client = any;
export type CustomCourseRequest = any;
export type ContactSubmission = any;

