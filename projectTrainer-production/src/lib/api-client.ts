/**
 * API Client for TrainMICE Backend (Trainer App)
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
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Request failed: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        this.setToken(null);
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      throw error;
    }
  }

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

  async post<T>(endpoint: string, data?: any): Promise<T> {
    // Handle FormData for file uploads
    if (data instanceof FormData) {
      const url = `${this.baseUrl}${endpoint}`;
      const token = this.getToken();

      const headers: HeadersInit = {
        ...(token && { Authorization: `Bearer ${token}` }),
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: data,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(error.error || `Request failed: ${response.statusText}`);
        }

        return await response.json();
      } catch (error: any) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          this.setToken(null);
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }
        throw error;
      }
    }

    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Authentication
  /**
   * Trainer Signup (Any Email Allowed)
   */
  async trainerSignup(data: {
    email: string;
    password: string;
    fullName?: string;
  }) {
    return this.post<{ message: string; user: any; requiresVerification: boolean }>('/auth/trainer/signup', data);
  }

  /**
   * Resend Verification Email
   */
  async resendVerification(email: string) {
    return this.post<{ message: string }>('/auth/resend-verification', { email });
  }

  /**
   * Register new user (Legacy - for backward compatibility)
   */
  async register(data: {
    email: string;
    password: string;
    fullName?: string;
    role: 'CLIENT' | 'TRAINER' | 'ADMIN';
  }) {
    const response = await this.post<{ user: any; token: string }>('/auth/register', data);
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async login(email: string, password: string) {
    const response = await this.post<{ user: any; token: string }>('/auth/login', {
      email,
      password,
    });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  logout() {
    this.setToken(null);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

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

  // Courses (Trainer can create/update/delete their own)
  async getCourses(params?: { courseType?: string; status?: string }) {
    const response = await this.get<{ courses: any[] }>('/courses', params);
    return response.courses;
  }

  // ============================================================================
  // EVENTS (Fixed Date Courses)
  // ============================================================================

  async getEvents(params?: { trainerId?: string; courseId?: string; status?: string }) {
    const response = await this.get<{ events: any[] }>('/events', params);
    return response.events || [];
  }

  async getEvent(eventId: string) {
    const response = await this.get<{ event: any }>(`/events/${eventId}`);
    return response.event;
  }

  async getCourse(id: string) {
    const response = await this.get<{ course: any }>(`/courses/${id}`);
    return response.course;
  }

  async createCourse(data: any) {
    const response = await this.post<{ course: any }>('/courses', data);
    return response.course;
  }

  async updateCourse(id: string, data: any) {
    const response = await this.put<{ course: any }>(`/courses/${id}`, data);
    return response.course;
  }

  async deleteCourse(id: string) {
    await this.delete(`/courses/${id}`);
  }

  // Trainer Profile
  async getTrainer(id: string) {
    const response = await this.get<{ trainer: any }>(`/trainers/${id}`);
    return response.trainer;
  }

  async updateTrainer(id: string, data: any) {
    const response = await this.put<{ trainer: any }>(`/trainers/${id}`, data);
    return response.trainer;
  }

  // Qualifications
  async getQualifications(trainerId: string) {
    const response = await this.get<{ qualifications: any[] }>(`/trainers/${trainerId}/qualifications`);
    return response.qualifications;
  }

  async createQualification(trainerId: string, data: any) {
    const response = await this.post<{ qualification: any }>(`/trainers/${trainerId}/qualifications`, data);
    return response.qualification;
  }

  async updateQualification(trainerId: string, qualId: string, data: any) {
    const response = await this.put<{ qualification: any }>(`/trainers/${trainerId}/qualifications/${qualId}`, data);
    return response.qualification;
  }

  async deleteQualification(trainerId: string, qualId: string) {
    await this.delete(`/trainers/${trainerId}/qualifications/${qualId}`);
  }

  // Work History
  async getWorkHistory(trainerId: string) {
    const response = await this.get<{ workHistory: any[] }>(`/trainers/${trainerId}/work-history`);
    return response.workHistory;
  }

  async createWorkHistory(trainerId: string, data: any) {
    const response = await this.post<{ workHistory: any }>(`/trainers/${trainerId}/work-history`, data);
    return response.workHistory;
  }

  async updateWorkHistory(trainerId: string, workId: string, data: any) {
    const response = await this.put<{ workHistory: any }>(`/trainers/${trainerId}/work-history/${workId}`, data);
    return response.workHistory;
  }

  async deleteWorkHistory(trainerId: string, workId: string) {
    await this.delete(`/trainers/${trainerId}/work-history/${workId}`);
  }

  // Past Clients
  async getPastClients(trainerId: string) {
    const response = await this.get<{ pastClients: any[] }>(`/trainers/${trainerId}/past-clients`);
    return response.pastClients;
  }

  async createPastClient(trainerId: string, data: any) {
    const response = await this.post<{ pastClient: any }>(`/trainers/${trainerId}/past-clients`, data);
    return response.pastClient;
  }

  async updatePastClient(trainerId: string, clientId: string, data: any) {
    const response = await this.put<{ pastClient: any }>(`/trainers/${trainerId}/past-clients/${clientId}`, data);
    return response.pastClient;
  }

  async deletePastClient(trainerId: string, clientId: string) {
    await this.delete(`/trainers/${trainerId}/past-clients/${clientId}`);
  }

  // Courses Conducted
  async getCoursesConducted(trainerId: string) {
    const response = await this.get<{ coursesConducted: any[] }>(`/trainers/${trainerId}/courses-conducted`);
    return response.coursesConducted;
  }

  async createCourseConducted(trainerId: string, data: any) {
    const response = await this.post<{ courseConducted: any }>(`/trainers/${trainerId}/courses-conducted`, data);
    return response.courseConducted;
  }

  async updateCourseConducted(trainerId: string, conductedId: string, data: any) {
    const response = await this.put<{ courseConducted: any }>(`/trainers/${trainerId}/courses-conducted/${conductedId}`, data);
    return response.courseConducted;
  }

  async deleteCourseConducted(trainerId: string, conductedId: string) {
    await this.delete(`/trainers/${trainerId}/courses-conducted/${conductedId}`);
  }

  // Availability
  async getTrainerAvailability(
    trainerId: string,
    params?: { month?: number; year?: number; startDate?: string; endDate?: string }
  ) {
    const response = await this.get<{ availability: any[] }>(
      `/availability/trainer/${trainerId}`,
      params
    );
    return response.availability;
  }

  async getTrainerBlockedDays(trainerId: string) {
    const response = await this.get<{ blockedDays: number[] }>(
      `/availability/trainer/${trainerId}/blocked-days`
    );
    return response;
  }

  async saveTrainerBlockedDays(trainerId: string, days: number[]) {
    const response = await this.put<{ blockedDays: number[] }>(
      `/availability/trainer/${trainerId}/blocked-days`,
      { days }
    );
    return response;
  }

  async createAvailability(trainerId: string, data: any | any[]) {
    const response = await this.post<{ availability: any | any[] }>(
      `/availability/trainer/${trainerId}`,
      Array.isArray(data) ? data : [data]
    );
    return response.availability;
  }

  async updateAvailability(id: string, data: any) {
    const response = await this.put<{ availability: any }>(`/availability/${id}`, data);
    return response.availability;
  }

  async deleteAvailability(id: string) {
    await this.delete(`/availability/${id}`);
  }

  // Bookings
  async getBookingRequests() {
    const response = await this.get<{ bookingRequests: any[] }>('/bookings');
    return response.bookingRequests;
  }

  async getBookingRequest(id: string) {
    const response = await this.get<{ bookingRequest: any }>(`/bookings/${id}`);
    return response.bookingRequest;
  }

  async updateBookingStatus(id: string, status: string) {
    const response = await this.put<{ bookingRequest: any }>(`/bookings/${id}/status`, { status });
    return response.bookingRequest;
  }

  // ============================================================================
  // MESSAGES & NOTIFICATIONS
  // ============================================================================

  async sendMessageToAdmin(data: {
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    subject?: string;
  }) {
    return this.post<{ thread: any; message: any }>('/trainer/messages', data);
  }

  async getMessageThread() {
    return this.get<{ thread: any; messages: any[] }>('/trainer/messages');
  }

  async markMessagesAsRead() {
    return this.put<{ message: string }>('/trainer/messages/read');
  }

  async getNotifications(params?: { page?: number; type?: string }) {
    return this.get<{ notifications: any[]; totalPages: number }>('/notifications', params);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.put<{ notification: any }>(`/notifications/${notificationId}/read`);
  }

  // ============================================================================
  // EVENT ENQUIRY MESSAGES
  // ============================================================================

  async getEventEnquiryConversation(enquiryId: string) {
    return this.get<{ enquiry: any; messages: any[] }>(`/event-enquiry-messages/trainer/${enquiryId}`);
  }

  async replyToEventEnquiry(enquiryId: string, message: string) {
    return this.post<{ newMessage: any }>(`/event-enquiry-messages/trainer/${enquiryId}/reply`, { message });
  }
}

export const apiClient = new ApiClient();

export type Course = any;
export type Trainer = any;
export type TrainerAvailability = any;
export type BookingRequest = any;

