import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api-client';

interface User {
  id: string;
  email: string;
  fullName?: string;
  role: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        const token = apiClient.getToken();
        if (token) {
          const response = await apiClient.getCurrentUser();
          if (response.user) {
            setUser(response.user);
          } else {
            apiClient.logout();
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        apiClient.logout();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for logout events
    const handleLogout = () => {
      setUser(null);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await apiClient.login(email, password);
      setUser(response.user);
      return { data: response, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || 'Login failed' } };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const response = await apiClient.register(email, password, fullName);
      setUser(response.user);
      return { data: response, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || 'Registration failed' } };
    }
  };

  const signOut = async () => {
    try {
      await apiClient.logout();
      setUser(null);
      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message || 'Logout failed' } };
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const response = await apiClient.forgotPassword(email);
      return { data: response, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || 'Failed to send password reset email' } };
    }
  };

  return { user, loading, signIn, signUp, signOut, forgotPassword };
};
