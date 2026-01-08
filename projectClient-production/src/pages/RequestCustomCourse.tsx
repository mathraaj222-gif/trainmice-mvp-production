import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Building2, Mail, User, Briefcase, MessageSquare } from 'lucide-react';
import { auth, type User as AuthUser } from '../lib/auth';
import { apiClient } from '../lib/api-client';

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Hospitality',
  'Construction',
  'Transportation',
  'Real Estate',
  'Professional Services',
  'Media & Entertainment',
  'Other',
];

export function RequestCustomCourse() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  const [signupData, setSignupData] = useState({
    email: '',
    password: '',
    userName: '',
    contactNumber: '',
  });

  const [courseData, setCourseData] = useState({
    courseName: '',
    reason: '',
    industry: '',
    companyName: '',
    contactPerson: '',
    email: '',
    preferredMode: 'In-house' as 'In-house' | 'Public' | 'Virtual',
  });

  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});
  const [courseErrors, setCourseErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const fetchClientData = async () => {
      const { user } = await auth.getSession();
      setUser(user);
      setIsLoadingAuth(false);
      if (user) {
        try {
          // Fetch client profile to get company information
          const profileResponse = await apiClient.getClientProfile();
          const client = profileResponse.client;
          
          // Pre-fill form with client data
          setCourseData((prev) => ({
            ...prev,
            contactPerson: user.fullName || client?.userName || user.email?.split('@')[0] || '',
            email: user.email || client?.companyEmail || '',
            companyName: client?.companyName || '',
          }));
        } catch (error) {
          console.error('Error fetching client profile:', error);
          // Fallback to user data if profile fetch fails
          setCourseData((prev) => ({
            ...prev,
            contactPerson: user.fullName || user.email?.split('@')[0] || '',
            email: user.email || '',
          }));
        }
        setShowSignup(false);
      } else {
        setShowSignup(true);
      }
    };

    fetchClientData();

    const unsubscribe = auth.onAuthStateChange(async (user) => {
      setUser(user);
      if (user) {
        try {
          // Fetch client profile to get company information
          const profileResponse = await apiClient.getClientProfile();
          const client = profileResponse.client;
          
          // Pre-fill form with client data
          setCourseData((prev) => ({
            ...prev,
            contactPerson: user.fullName || client?.userName || user.email?.split('@')[0] || '',
            email: user.email || client?.companyEmail || '',
            companyName: client?.companyName || '',
          }));
        } catch (error) {
          console.error('Error fetching client profile:', error);
          // Fallback to user data if profile fetch fails
          setCourseData((prev) => ({
            ...prev,
            contactPerson: user.fullName || user.email?.split('@')[0] || '',
            email: user.email || '',
          }));
        }
        setShowSignup(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const validateSignup = () => {
    const errors: Record<string, string> = {};

    if (!signupData.email.trim()) {
      errors.email = 'Company email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!signupData.password || signupData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!signupData.userName.trim()) {
      errors.userName = 'User name is required';
    }

    if (!signupData.contactNumber.trim()) {
      errors.contactNumber = 'Contact number is required';
    }

    setSignupErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateSignup()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await auth.signUp({
        email: signupData.email,
        password: signupData.password,
        fullName: signupData.userName,
        userName: signupData.userName,
        contactNumber: signupData.contactNumber,
        role: 'CLIENT',
      });

      if (signUpError) throw new Error(signUpError.message);

      if (data?.user) {
        setShowSignup(false);
        setUser(data.user);
        setCourseData((prev) => ({
          ...prev,
          contactPerson: signupData.userName,
          email: signupData.email,
        }));
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      setSignupErrors({ submit: error.message || 'Failed to create account' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateCourseRequest = () => {
    const errors: Record<string, string> = {};

    if (!courseData.courseName.trim()) {
      errors.courseName = 'Course name is required';
    }

    if (!courseData.reason.trim()) {
      errors.reason = 'Please explain why you need this course';
    }

    if (!courseData.industry) {
      errors.industry = 'Industry is required';
    }

    if (!courseData.companyName.trim()) {
      errors.companyName = 'Company name is required';
    }

    if (!courseData.contactPerson.trim()) {
      errors.contactPerson = 'Contact person is required';
    }

    if (!courseData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courseData.email)) {
      errors.email = 'Invalid email format';
    }

    setCourseErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateCourseRequest()) {
      return;
    }

    if (!user) {
      setCourseErrors({ submit: 'You must be logged in to submit a request' });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      await apiClient.createCustomRequest({
        clientId: user.id,
        courseName: courseData.courseName,
        reason: courseData.reason,
        industry: courseData.industry,
        companyName: courseData.companyName,
        contactPerson: courseData.contactPerson,
        email: courseData.email,
        preferredMode: courseData.preferredMode.toUpperCase().replace('-', '_') as any,
      });

      setSubmitStatus('success');
      setCourseData({
        courseName: '',
        reason: '',
        industry: '',
        companyName: '',
        contactPerson: courseData.contactPerson,
        email: courseData.email,
        preferredMode: 'In-house',
      });

      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting course request:', error);
      setSubmitStatus('error');
      setCourseErrors({ submit: error.message || 'Failed to submit request' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Request Custom Course</h1>
              <p className="text-gray-600">Tailor-made training solutions for your organization</p>
            </div>
          </div>

          {showSignup && !user && (
            <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create Your Account</h2>
              <p className="text-gray-600 mb-6">
                Please create an account to submit your custom course request
              </p>

              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    className={`w-full px-4 py-2 border ${
                      signupErrors.email ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="your.email@company.com"
                  />
                  {signupErrors.email && <p className="mt-1 text-sm text-red-500">{signupErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    className={`w-full px-4 py-2 border ${
                      signupErrors.password ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="At least 6 characters"
                  />
                  {signupErrors.password && <p className="mt-1 text-sm text-red-500">{signupErrors.password}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={signupData.userName}
                    onChange={(e) => setSignupData({ ...signupData, userName: e.target.value })}
                    className={`w-full px-4 py-2 border ${
                      signupErrors.userName ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="John Doe"
                  />
                  {signupErrors.userName && <p className="mt-1 text-sm text-red-500">{signupErrors.userName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={signupData.contactNumber}
                    onChange={(e) => setSignupData({ ...signupData, contactNumber: e.target.value })}
                    className={`w-full px-4 py-2 border ${
                      signupErrors.contactNumber ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="+60 12-345 6789"
                  />
                  {signupErrors.contactNumber && (
                    <p className="mt-1 text-sm text-red-500">{signupErrors.contactNumber}</p>
                  )}
                </div>

                {signupErrors.submit && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                    {signupErrors.submit}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400"
                >
                  {isSubmitting ? 'Creating Account...' : 'Create Account & Continue'}
                </button>
              </form>
            </div>
          )}

          {user && !showSignup && (
            <form onSubmit={handleCourseSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <BookOpen className="inline w-4 h-4 mr-1" />
                  Topic Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseData.courseName}
                  onChange={(e) => setCourseData({ ...courseData, courseName: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.courseName ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g., Advanced Leadership Training"
                />
                {courseErrors.courseName && <p className="mt-1 text-sm text-red-500">{courseErrors.courseName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MessageSquare className="inline w-4 h-4 mr-1" />
                  Expected Learning Outcomes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={courseData.reason}
                  onChange={(e) => setCourseData({ ...courseData, reason: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.reason ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Tell us about your training needs and objectives..."
                />
                {courseErrors.reason && <p className="mt-1 text-sm text-red-500">{courseErrors.reason}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="inline w-4 h-4 mr-1" />
                  Industry <span className="text-red-500">*</span>
                </label>
                <select
                  value={courseData.industry}
                  onChange={(e) => setCourseData({ ...courseData, industry: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.industry ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
                {courseErrors.industry && <p className="mt-1 text-sm text-red-500">{courseErrors.industry}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Building2 className="inline w-4 h-4 mr-1" />
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseData.companyName}
                  onChange={(e) => setCourseData({ ...courseData, companyName: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.companyName ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Your Company Sdn Bhd"
                />
                {courseErrors.companyName && <p className="mt-1 text-sm text-red-500">{courseErrors.companyName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="inline w-4 h-4 mr-1" />
                  Contact Person Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseData.contactPerson}
                  onChange={(e) => setCourseData({ ...courseData, contactPerson: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.contactPerson ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="John Doe"
                />
                {courseErrors.contactPerson && (
                  <p className="mt-1 text-sm text-red-500">{courseErrors.contactPerson}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="inline w-4 h-4 mr-1" />
                  Company Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={courseData.email}
                  onChange={(e) => setCourseData({ ...courseData, email: e.target.value })}
                  className={`w-full px-4 py-2 border ${
                    courseErrors.email ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="contact@company.com"
                />
                {courseErrors.email && <p className="mt-1 text-sm text-red-500">{courseErrors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Preferred Mode <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {(['In-house', 'Public', 'Virtual'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="preferredMode"
                        value={mode}
                        checked={courseData.preferredMode === mode}
                        onChange={(e) =>
                          setCourseData({
                            ...courseData,
                            preferredMode: e.target.value as 'In-house' | 'Public' | 'Virtual',
                          })
                        }
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{mode}</span>
                    </label>
                  ))}
                </div>
              </div>

              {submitStatus === 'success' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                  Thank you! Your custom course request has been submitted successfully. We'll get back to you soon.
                  Redirecting to home...
                </div>
              )}

              {submitStatus === 'error' && courseErrors.submit && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  {courseErrors.submit}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                {isSubmitting ? 'Submitting Request...' : 'Submit Course Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
