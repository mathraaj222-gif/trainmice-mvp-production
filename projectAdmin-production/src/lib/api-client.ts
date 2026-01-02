/**
 * API Client for TrainMICE Backend (Admin App)
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
    // Normalize base URL to remove trailing slash
    this.baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    this.token = localStorage.getItem('token');
  }

  private normalizeUrl(endpoint: string): string {
    // Normalize URL to avoid double slashes
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${normalizedEndpoint}`;
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
    const url = this.normalizeUrl(endpoint);
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
    const url = new URL(this.normalizeUrl(endpoint), window.location.origin);
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
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

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

  async register(email: string, password: string, fullName?: string) {
    const response = await this.post<{ user: any; token: string }>('/auth/register', {
      email,
      password,
      fullName,
      role: 'ADMIN',
    });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async logout() {
    this.setToken(null);
  }

  async getCurrentUser() {
    return this.get<{ user: any }>('/auth/me');
  }

  // ============================================================================
  // ADMIN PROFILE
  // ============================================================================

  async getAdminProfile() {
    return this.get<{ id: string; email: string; fullName: string; adminCode: string }>('/admin/profile');
  }

  async updateAdminProfile(data: { fullName?: string }) {
    return this.put<{ message: string; admin: any }>('/admin/profile', data);
  }


  // ============================================================================
  // TRAINERS
  // ============================================================================

  async getTrainers(params?: { search?: string; category?: string; state?: string }) {
    return this.get<{ trainers: any[] }>('/admin/trainers', params);
  }

  async getTrainer(id: string) {
    return this.get<{ trainer: any }>(`/admin/trainers/${id}`);
  }

  async createTrainer(data: any) {
    return this.post<{ message: string; trainer: any }>('/admin/trainers', data);
  }

  async addTrainer(data: any) {
    // Alias for createTrainer
    return this.createTrainer(data);
  }

  async updateTrainer(id: string, data: any) {
    return this.put<{ message: string; trainer: any }>(`/admin/trainers/${id}`, data);
  }

  async deleteTrainer(id: string) {
    return this.delete<{ message: string }>(`/admin/trainers/${id}`);
  }

  async getTrainerWeeklyAvailability(trainerId: string) {
    return this.get<{ availability: any[] }>(`/admin/trainers/${trainerId}/availability/weekly`);
  }

  async setTrainerWeeklyAvailability(trainerId: string, availability: any[]) {
    return this.post<{ availability: any[] }>(`/admin/trainers/${trainerId}/availability/weekly`, { availability });
  }

  async getTrainerBlockedDates(trainerId: string) {
    return this.get<{ blockedDates: any[] }>(`/admin/trainers/${trainerId}/blocked-dates`);
  }

  async addTrainerBlockedDate(trainerId: string, data: { blockedDate: string; reason?: string }) {
    return this.post<{ blockedDate: any }>(`/admin/trainers/${trainerId}/blocked-dates`, data);
  }

  async removeTrainerBlockedDate(trainerId: string, dateId: string) {
    return this.delete<{ message: string }>(`/admin/trainers/${trainerId}/blocked-dates/${dateId}`);
  }

  // ============================================================================
  // BOOKINGS
  // ============================================================================

  async getBookings(params?: { status?: string; requestType?: string }) {
    return this.get<{ bookings: any[] }>('/admin/bookings', params);
  }

  async getConflictingBookings(bookingId: string) {
    return this.get<{ conflictingBookings: any[] }>(`/admin/bookings/${bookingId}/conflicting`);
  }

  async sendEmailToClients(data: { clientIds: string[]; title: string; message: string }) {
    return this.post<{ message: string; sentCount: number }>('/admin/bookings/send-email', data);
  }

  async confirmBooking(id: string, totalSlots: number, availabilityId: string, registeredParticipants?: number, eventDate?: string) {
    return this.put<{ message: string; booking: any; event?: any }>(`/admin/bookings/${id}/confirm`, {
      totalSlots: parseInt(String(totalSlots)),
      availabilityId: availabilityId,
      registeredParticipants: registeredParticipants ? parseInt(String(registeredParticipants)) : undefined,
      eventDate: eventDate || undefined,
    });
  }

  async cancelBooking(id: string) {
    return this.put<{ message: string; booking: any }>(`/admin/bookings/${id}/cancel`);
  }

  // ============================================================================
  // EVENTS (Fixed Date Courses - Book Now)
  // ============================================================================

  async getEvents(params?: { trainerId?: string; courseId?: string; status?: string }) {
    return this.get<{ events: any[] }>('/events', params);
  }

  async getEventRegistrations(params?: { courseId?: string; trainerId?: string; eventId?: string }) {
    return this.get<{ registrations: any[] }>('/admin/events/registrations', params);
  }

  async approveEventRegistration(id: string, numberOfParticipants: number) {
    return this.put<{ registration: any; message: string }>(`/admin/events/registrations/${id}/approve`, { numberOfParticipants });
  }

  async cancelEventRegistration(id: string) {
    return this.put<{ registration: any; message: string }>(`/admin/events/registrations/${id}/cancel`);
  }

  async updateEventStatus(id: string, status: string) {
    return this.put<{ event: any; message: string }>(`/admin/events/${id}/status`, { status });
  }

  async autoCompletePastEvents() {
    return this.post<{ message: string; count: number; events: any[] }>('/admin/events/auto-complete-past');
  }

  // ============================================================================
  // CUSTOM COURSE REQUESTS
  // ============================================================================

  async getCustomRequests(params?: { status?: string }) {
    return this.get<{ requests: any[] }>('/admin/custom-requests', params);
  }

  async approveRequest(id: string, data: { assignedTrainerId: string; adminNotes?: string }) {
    return this.put<{ message: string; request: any; course: any }>(`/admin/custom-requests/${id}/approve`, data);
  }

  async rejectRequest(id: string) {
    return this.put<{ message: string; request: any }>(`/admin/custom-requests/${id}/reject`);
  }

  // ============================================================================
  // TRAINER MESSAGES (Two-way messaging)
  // ============================================================================

  async getTrainerMessages(params?: { page?: number; limit?: number; isRead?: boolean; search?: string }) {
    return this.get<{ threads: any[]; legacyMessages: any[]; total: number; page: number; totalPages: number }>('/admin/trainer-messages', params);
  }

  async getTrainerThread(trainerId: string) {
    return this.get<{ thread: any; trainer: any; messages: any[] }>(`/admin/trainer-messages/${trainerId}/thread`);
  }

  async replyToTrainer(trainerId: string, message: string) {
    return this.post<{ thread: any; message: any }>(`/admin/trainer-messages/${trainerId}/reply`, { message });
  }

  async markMessageAsRead(id: string) {
    return this.put<{ message: any }>(`/admin/trainer-messages/${id}/read`);
  }

  // ============================================================================
  // NOTIFICATIONS (using existing routes)
  // ============================================================================

  async markAllNotificationsAsRead() {
    return this.put<{ message: string }>('/notifications/read-all');
  }

  // ============================================================================
  // ACTIVITY LOGS
  // ============================================================================

  async getAdminLogs(params?: { action?: string; startDate?: string; endDate?: string; search?: string; page?: number }) {
    return this.get<{ logs: any[]; total: number; page: number; totalPages: number }>('/admin/logs/admin', params);
  }

  // ============================================================================
  // COURSES (Admin)
  // ============================================================================

  async getAdminCourses(params?: { status?: string; search?: string }) {
    return this.get<{ courses: any[] }>('/admin/courses', params);
  }

  async getAdminCourse(id: string) {
    return this.get<{ course: any }>(`/admin/courses/${id}`);
  }

  async createAdminCourse(data: any) {
    return this.post<{ course: any }>('/admin/courses', data);
  }

  async updateAdminCourse(id: string, data: any) {
    return this.put<{ course: any }>(`/admin/courses/${id}`, data);
  }

  async createEventFromCourse(courseId: string, eventData: { 
    availabilityId: string; 
    courseType: 'IN_HOUSE' | 'PUBLIC'; 
    courseMode: 'PHYSICAL' | 'ONLINE' | 'HYBRID';
    price: string | null;
    venue: string | null;
    city: string | null;
    state: string | null;
  }) {
    return this.post<{ event: any; message: string }>(`/admin/courses/${courseId}/create-event`, eventData);
  }

  async deleteAdminCourse(id: string) {
    return this.delete<{ message: string }>(`/admin/courses/${id}`);
  }

  async assignTrainerToCourse(courseId: string, trainerId: string) {
    return this.post<{ courseTrainer: any }>(`/admin/courses/${courseId}/trainers`, { trainerId });
  }

  async removeTrainerFromCourse(courseId: string, trainerId: string) {
    return this.delete<{ message: string }>(`/admin/courses/${courseId}/trainers/${trainerId}`);
  }

  // ============================================================================
  // DOCUMENTS (Admin)
  // ============================================================================

  async getAdminDocuments(params?: { trainerId?: string; verified?: boolean; documentType?: string; courseId?: string }) {
    return this.get<{ documents: any[] }>('/admin/documents', params);
  }

  async getAdminDocument(id: string) {
    return this.get<{ document: any }>(`/admin/documents/${id}`);
  }

  async verifyDocument(id: string, data: { verified: boolean; notes?: string }) {
    return this.put<{ document: any }>(`/admin/documents/${id}/verify`, data);
  }

  async deleteAdminDocument(id: string) {
    return this.delete<{ message: string }>(`/admin/documents/${id}`);
  }

  // ============================================================================
  // ACTIVITY LOGS
  // ============================================================================

  async getActivityLogs(params?: { actionType?: string; entityType?: string; search?: string; page?: number; limit?: number }) {
    return this.get<{ logs: any[]; total: number; page: number; totalPages: number }>('/admin/logs/activity', params);
  }

  // ============================================================================
  // DASHBOARD (Enhanced)
  // ============================================================================

  async getDashboardMetrics() {
    return this.get<{
      totalTrainers: number;
      totalClients: number;
      activeCourses: number;
      pendingBookings: number;
      pendingHRDCVerifications: number;
      unreadMessages: number;
      upcomingCourses: number;
    }>('/admin/dashboard/metrics');
  }

  async getActivityTimeline(params?: { limit?: number }) {
    return this.get<{ activities: any[] }>('/admin/dashboard/activity-timeline', params);
  }

  async getUpcomingCourses() {
    return this.get<{ courses: any[] }>('/admin/dashboard/upcoming-courses');
  }

  async getPendingBookingsSummary() {
    return this.get<{ bookings: any[] }>('/admin/dashboard/pending-bookings');
  }

  // ============================================================================
  // MESSAGES (Enhanced)
  // ============================================================================

  async getContactSubmissions(params?: { resolved?: boolean; page?: number; limit?: number }) {
    return this.get<{ submissions: any[]; total: number; page: number; totalPages: number }>('/admin/messages/contact-submissions', params);
  }

  async resolveContactSubmission(id: string) {
    return this.put<{ message: string }>(`/admin/messages/contact-submissions/${id}/resolve`);
  }

  async sendNotification(data: {
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
    userId?: string;
    userRole?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }) {
    return this.post<{ notification?: any; notifications?: any[]; count?: number; message: string }>('/admin/messages/notifications/send', data);
  }

  async getNotifications(params?: { isRead?: boolean; userId?: string; type?: string; page?: number; limit?: number }) {
    return this.get<{ notifications: any[]; total: number; page: number; totalPages: number }>('/admin/messages/notifications', params);
  }

  async markNotificationAsRead(id: string) {
    return this.put<{ notification: any }>(`/admin/messages/notifications/${id}/read`);
  }

  async deleteNotification(id: string) {
    return this.delete<{ message: string }>(`/admin/messages/notifications/${id}`);
  }

  // ============================================================================
  // TRAINERS (Enhanced)
  // ============================================================================

  async getTrainerAnalytics(trainerId: string) {
    return this.get<{
      totalCourses: number;
      avgRating: number;
      totalBookings: number;
      cancelledBookings: number;
      cancellationRate: number;
      avgResponseTime: number | null;
      feedbackCount: number;
    }>(`/admin/trainers/${trainerId}/analytics`);
  }

  async verifyHRDC(trainerId: string, data: {
    hrdcAccreditationId?: string;
    hrdcAccreditationValidUntil?: string;
    verified: boolean;
  }) {
    return this.put<{ trainer: any; message: string }>(`/admin/trainers/${trainerId}/hrdc/verify`, data);
  }

  async blockTrainerAvailability(trainerId: string, data: { blockedDate: string; reason?: string }) {
    return this.post<{ blocked: any; message: string }>(`/admin/trainers/${trainerId}/availability/block`, data);
  }

  async unblockTrainerAvailability(trainerId: string, blockedId: string) {
    return this.delete<{ message: string }>(`/admin/trainers/${trainerId}/availability/block/${blockedId}`);
  }

  async getTrainerAvailability(
    trainerId: string,
    params?: { month?: number; year?: number; startDate?: string; endDate?: string }
  ) {
    return this.get<{ availability: any[] }>(
      `/availability/trainer/${trainerId}`,
      params
    );
  }

  async getTrainerAvailabilityConflicts(trainerId: string, params: { startDate: string; endDate: string }) {
    return this.get<{
      hasConflict: boolean;
      existingBookings: any[];
      blockedDates: any[];
      weeklyAvailability: any[];
    }>(`/admin/trainers/${trainerId}/availability/conflicts`, params);
  }

  async searchTrainersAdvanced(params?: {
    expertise?: string;
    hrdcStatus?: 'certified' | 'expired' | 'none';
    state?: string;
    minRating?: number;
    availableFrom?: string;
    availableTo?: string;
  }) {
    return this.get<{ trainers: any[]; count: number }>('/admin/trainers/search/advanced', params);
  }

  // ============================================================================
  // COURSES (Enhanced)
  // ============================================================================

  async approveCourse(courseId: string) {
    return this.put<{ course: any; message: string }>(`/admin/courses/${courseId}/approve`);
  }

  async rejectCourse(courseId: string, rejectionReason?: string) {
    return this.put<{ course: any; message: string }>(`/admin/courses/${courseId}/reject`, { rejectionReason });
  }

  async uploadCourseMaterial(courseId: string, data: { fileUrl: string; fileName: string }) {
    return this.post<{ material: any }>(`/admin/courses/${courseId}/materials`, data);
  }

  async deleteCourseMaterial(courseId: string, materialId: string) {
    return this.delete<{ message: string }>(`/admin/courses/${courseId}/materials/${materialId}`);
  }

  async getCourseReviews(courseId: string) {
    return this.get<{ reviews: any[] }>(`/admin/courses/${courseId}/reviews`);
  }

  async deleteCourseReview(courseId: string, reviewId: string) {
    return this.delete<{ message: string }>(`/admin/courses/${courseId}/reviews/${reviewId}`);
  }

  async getCourseSchedule(courseId: string) {
    return this.get<{ schedule: any[] }>(`/admin/courses/${courseId}/schedule`);
  }

  async updateCourseSchedule(courseId: string, schedule: any[]) {
    return this.put<{ schedule: any; count: number }>(`/admin/courses/${courseId}/schedule`, { schedule });
  }

  // ============================================================================
  // BOOKINGS (Enhanced)
  // ============================================================================

  async getBookingRequests(params?: {
    status?: string;
    trainerId?: string;
    clientId?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<{ bookings: any[]; total: number; page: number; totalPages: number }>('/admin/bookings/requests', params);
  }

  async getTrainerResponse(bookingId: string) {
    return this.get<{ booking: any; trainerResponse: string }>(`/admin/bookings/requests/${bookingId}/trainer-response`);
  }

  async overrideBookingApproval(bookingId: string, overrideReason: string) {
    return this.put<{ booking: any; message: string }>(`/admin/bookings/requests/${bookingId}/override-approval`, { overrideReason });
  }

  async detectBookingConflicts(params: { trainerId: string; startDate: string; endDate: string }) {
    return this.get<{
      hasConflict: boolean;
      existingBookings: any[];
      blockedDates: any[];
      weeklyAvailability: any[];
      suggestedAlternatives: any[];
    }>('/admin/bookings/conflicts/detect', params);
  }

  async resolveBookingConflict(data: {
    bookingId: string;
    resolution: 'reschedule' | 'override' | 'cancel';
    newDate?: string;
  }) {
    return this.post<{ booking: any; message: string }>('/admin/bookings/conflicts/resolve', data);
  }

  // ============================================================================
  // CLIENTS
  // ============================================================================

  async getClients(params?: { search?: string; page?: number; limit?: number }) {
    return this.get<{ clients: any[]; total: number; page: number; totalPages: number }>('/admin/clients', params);
  }

  async getClient(id: string) {
    return this.get<{ client: any }>(`/admin/clients/${id}`);
  }

  async updateClient(id: string, data: { userName?: string; contactNumber?: string }) {
    return this.put<{ client: any; message: string }>(`/admin/clients/${id}`, data);
  }

  async getClientTrainingHistory(clientId: string) {
    return this.get<{ history: any[] }>(`/admin/clients/${clientId}/training-history`);
  }

  async getClientFeedback(clientId: string) {
    return this.get<{ feedbacks: any[] }>(`/admin/clients/${clientId}/feedback`);
  }

  async getClientAnalytics(clientId: string) {
    return this.get<{
      totalBookings: number;
      completedBookings: number;
      totalSpending: number;
      coursesTaken: number;
      topCategories: Array<{ category: string; count: number }>;
    }>(`/admin/clients/${clientId}/analytics`);
  }

  // ============================================================================
  // SYSTEM SETTINGS
  // ============================================================================

  async getAdmins() {
    return this.get<{ admins: any[] }>('/admin/settings/admins');
  }

  async createAdmin(data: { email: string; password: string; fullName?: string; adminCode?: string }) {
    return this.post<{ admin: any; message: string }>('/admin/settings/admins', data);
  }

  async updateAdmin(id: string, data: { fullName?: string; adminCode?: string; password?: string }) {
    return this.put<{ admin: any; message: string }>(`/admin/settings/admins/${id}`, data);
  }

  async deleteAdmin(id: string) {
    return this.delete<{ message: string }>(`/admin/settings/admins/${id}`);
  }

  async getPlatformSettings() {
    return this.get<{ settings: any }>('/admin/settings/platform');
  }

  async updatePlatformSettings(data: {
    maintenanceMode?: boolean;
    allowTrainerRegistration?: boolean;
    allowClientRegistration?: boolean;
  }) {
    return this.put<{ message: string; settings: any }>('/admin/settings/platform', data);
  }

  // ============================================================================
  // TRAINER RECOMMENDATION
  // ============================================================================

  async getEventEnquiries(params?: { page?: number; limit?: number; isRead?: boolean; eventId?: string }) {
    return this.get<{ enquiries: any[]; total: number; page: number; totalPages: number }>(
      '/admin/event-enquiries',
      params
    );
  }

  async markTrainerMessageAsRead(messageId: string) {
    return this.put<{ message: any }>(`/admin/trainer-messages/${messageId}/read`);
  }

  async markEventEnquiryAsRead(enquiryId: string) {
    return this.put<{ enquiry: any }>(`/admin/event-enquiries/${enquiryId}/read`);
  }

  async getEventEnquiryConversation(enquiryId: string) {
    return this.get<{ enquiry: any; messages: any[] }>(`/event-enquiry-messages/admin/${enquiryId}`);
  }

  async replyToEventEnquiry(enquiryId: string, message: string) {
    return this.post<{ newMessage: any }>(`/event-enquiry-messages/admin/${enquiryId}/reply`, { message });
  }

  async recommendTrainers(criteria: {
    courseType?: string;
    category?: string;
    preferredDate?: string;
    endDate?: string;
    location?: string;
    minRating?: number;
  }) {
    return this.post<{ recommendations: Array<{ trainer: any; score: number; reasons: string[] }> }>('/admin/trainers/recommend', criteria);
  }

  // ============================================================================
  // FEEDBACK FORMS
  // ============================================================================

  async generateFeedbackQR(eventId: string) {
    return this.get<{ qrCode: string; url: string; eventId: string }>(`/feedback/qr/${eventId}`);
  }

  async getFeedbackAnalytics(params?: {
    trainerId?: string;
    courseId?: string;
    courseDate?: string;
    eventId?: string;
  }) {
    return this.get<{
      feedbacks: any[];
      summary: {
        total: number;
        averages: {
          contentClarity: number | null;
          objectivesAchieved: number | null;
          materialsHelpful: number | null;
          learningEnvironment: number | null;
          trainerKnowledge: number | null;
          trainerEngagement: number | null;
          knowledgeExposure: number | null;
          knowledgeApplication: number | null;
          durationSuitable: number | null;
          recommendCourse: number | null;
        };
      };
    }>('/feedback/analytics', params);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

