import { useState, useEffect } from 'react';
import { X, AlertCircle, Lock } from 'lucide-react';
import { Course, Trainer, TrainerAvailability } from '../lib/api-client';
import { auth } from '../lib/auth';
import { apiClient } from '../lib/api-client';
import {
  startOfMonth,
  format,
  parseISO,
  addMonths,
} from 'date-fns';
import { formatDuration } from '../utils/calendarHelpers';

type AdvancedBookingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  trainer: Trainer | null;
  availability: TrainerAvailability[];
};

export function AdvancedBookingModal({
  isOpen,
  onClose,
  course,
  trainer,
  availability,
}: AdvancedBookingModalProps) {
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    userName: '',
    userEmail: '',
  });
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      const { user } = await auth.getSession();
      setIsAuthenticated(!!user);
      setIsCheckingAuth(false);

      if (user) {
        try {
          // Fetch client profile to get company information
          const profileResponse = await apiClient.getClientProfile();
          const client = profileResponse.client;
          
          const userName = user.fullName || client?.userName || user.email?.split('@')[0] || '';
          const userEmail = user.email || client?.companyEmail || '';
          setFormData(prev => ({
            ...prev,
            userName,
            userEmail,
            companyName: client?.companyName || '',
            address: client?.companyAddress || '',
          }));
        } catch (error) {
          console.error('Error fetching client profile:', error);
          // Fallback to user data if profile fetch fails
          const userName = user.fullName || user.email?.split('@')[0] || '';
          const userEmail = user.email || '';
          setFormData(prev => ({
            ...prev,
            userName,
            userEmail,
          }));
        }
      }
    };

    if (isOpen) {
      fetchUserData();
    }

    const unsubscribe = auth.onAuthStateChange((user) => {
      setIsAuthenticated(!!user);
    });

    return () => unsubscribe();
  }, [isOpen]);

  const getNextTwelveMonths = () => {
    const months = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const date = addMonths(today, i);
      months.push({
        value: format(startOfMonth(date), 'yyyy-MM-dd'),
        label: format(date, 'MMMM yyyy'),
      });
    }
    return months;
  };

  if (!isOpen || !course) return null;

  if (isCheckingAuth) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-8 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600 mb-6">
            Please log in to make a booking request.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('openLogin'));
              }}
              className="px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('openSignup'));
              }}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmitPublicBooking = async () => {
    if (!selectedMonth) {
      alert('Please select a month');
      return;
    }
    if (!formData.companyName || !formData.address || !formData.userName || !formData.userEmail) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const { user } = await auth.getSession();
      if (!user) {
        alert('Please log in to submit a booking request');
        return;
      }

      await apiClient.createBookingRequest({
        courseId: course.id,
        trainerId: course.trainerId || course.trainer_id,
        clientId: user.id,
        requestType: 'PUBLIC',
        clientName: formData.userName,
        clientEmail: formData.userEmail,
        requestedDate: selectedMonth ? new Date(selectedMonth).toISOString().split('T')[0] : null,
        location: formData.address,
        status: 'PENDING',
      });

      const trainerCode = trainer?.customTrainerId || trainer?.custom_trainer_id || 'N/A';
      alert(
        `Your public session request has been sent to Trainer ${trainerCode}. They will review and propose specific dates.`
      );

      setTimeout(() => {
        onClose();
        setFormData({ companyName: '', address: '', userName: '', userEmail: '' });
        setSelectedMonth('');
      }, 2000);
    } catch (error) {
      console.error('Error submitting booking:', error);
      alert('Failed to submit booking request');
    }
  };

  const courseFixedDate = course.event_date ? parseISO(course.event_date) : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Request for Public Session</h2>
            <p className="text-sm text-gray-600 mt-1">{course.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900">Course Details</p>
                  <p className="text-sm text-blue-800 mt-1">
                    Date: {courseFixedDate
                      ? format(courseFixedDate, 'MMMM d, yyyy')
                      : 'To be announced'}
                  </p>
                  <p className="text-sm text-blue-800">Duration: {formatDuration(course.duration_hours, course.duration_unit)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  >
                    <option value="">Select a month</option>
                    {getNextTwelveMonths().map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 mt-1">
                    The trainer will review your request and propose specific dates for this month.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter company name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter full address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input
                      type="text"
                      value={formData.userName}
                      onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      placeholder="Enter your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Email</label>
                    <input
                      type="email"
                      value={formData.userEmail}
                      onChange={(e) => setFormData({ ...formData, userEmail: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      placeholder="Enter company email"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPublicBooking}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Submit Request
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
