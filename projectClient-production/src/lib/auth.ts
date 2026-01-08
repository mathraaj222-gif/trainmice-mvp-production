/**
 * Authentication utilities for TrainMICE
 * Replaces Supabase auth with JWT-based authentication
 */

import { apiClient } from './api-client';

export interface User {
  id: string;
  email: string;
  fullName?: string;
  role: 'CLIENT' | 'TRAINER' | 'ADMIN';
  emailVerified?: boolean;
}

class AuthService {
  private currentUser: User | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of auth state change
   */
  private notifyListeners() {
    this.listeners.forEach((callback) => callback(this.currentUser));
  }

  /**
   * Get current session (check if user is logged in)
   */
  async getSession(): Promise<{ user: User | null; session: { access_token: string } | null }> {
    const token = apiClient.getToken();
    if (!token) {
      return { user: null, session: null };
    }

    try {
      const user = await apiClient.getCurrentUser();
      if (user) {
        this.currentUser = user;
        return {
          user,
          session: { access_token: token },
        };
      }
    } catch (error) {
      console.error('Error getting session:', error);
    }

    return { user: null, session: null };
  }

  /**
   * Register new user (Client Signup - Company Email Only)
   */
  async signUp(data: {
    email: string;
    password: string;
    fullName?: string;
    role?: 'CLIENT' | 'TRAINER' | 'ADMIN';
    contactNumber?: string;
    userName?: string;
    position?: string;
    companyName?: string;
    companyAddress?: string;
    city?: string;
    state?: string;
  }) {
    try {
      // Use client signup endpoint for CLIENT role
      if (data.role === 'CLIENT' || !data.role) {
        const response = await apiClient.clientSignup({
          email: data.email,
          password: data.password,
          fullName: data.fullName || data.userName,
          userName: data.userName,
          contactNumber: data.contactNumber,
          position: data.position,
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          city: data.city,
          state: data.state,
        });

        // Client signup requires verification - no token yet
        return {
          data: {
            user: response.user,
            session: null, // No session until verified
            requiresVerification: true,
          },
          error: null,
        };
      } else {
        // Legacy register for other roles (if needed)
        const response = await apiClient.register({
          email: data.email,
          password: data.password,
          fullName: data.fullName || data.userName,
          role: data.role,
        });

        this.currentUser = response.user;
        this.notifyListeners();

        return {
          data: {
            user: response.user,
            session: { access_token: response.token },
          },
          error: null,
        };
      }
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message },
      };
    }
  }

  /**
   * Sign in user
   */
  async signIn(email: string, password: string) {
    try {
      const response = await apiClient.login(email, password);

      // Check if login was blocked due to unverified email
      if ((response as any).requiresVerification) {
        return {
          data: { user: null, session: null },
          error: { message: 'Please verify your email address before logging in.' },
          requiresVerification: true,
        };
      }

      this.currentUser = response.user;
      this.notifyListeners();

      return {
        data: {
          user: response.user,
          session: { access_token: response.token },
        },
        error: null,
      };
    } catch (error: any) {
      // Check if error is due to unverified email
      if (error.message && error.message.includes('Email not verified')) {
        return {
          data: { user: null, session: null },
          error: { message: error.message },
          requiresVerification: true,
        };
      }
      return {
        data: { user: null, session: null },
        error: { message: error.message },
      };
    }
  }

  /**
   * Sign out user
   */
  async signOut() {
    apiClient.logout();
    this.currentUser = null;
    this.notifyListeners();
    return { error: null };
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.currentUser;
  }

  /**
   * Initialize auth state (call on app startup)
   */
  async initialize() {
    const { user } = await this.getSession();
    if (user) {
      this.currentUser = user;
      this.notifyListeners();
    }
  }
}

// Export singleton instance
export const auth = new AuthService();

// Initialize on module load
auth.initialize();

