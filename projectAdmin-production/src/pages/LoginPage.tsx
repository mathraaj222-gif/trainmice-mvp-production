import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const { signIn, forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError.message);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setForgotPasswordLoading(true);

    try {
      const { error: forgotError } = await forgotPassword(email);
      if (forgotError) {
        setError(forgotError.message || 'Failed to send password reset email');
      } else {
        setSuccess('If an account exists with this email, a password reset link has been sent. Please check your inbox.');
        setShowForgotPassword(false);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: 'url(/tropical-green-leaves-background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-30"></div>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/TrainmiceTwinleaf.png"
            alt="Trainmice"
            className="h-48 mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">Admin Dashboard</h1>
          <p className="text-white drop-shadow-md">Sign in to manage your training platform</p>
        </div>

        <Card>
          <div className="p-8">
            {!showForgotPassword ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  required
                  placeholder="admin@klgreens.com"
                />

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  required
                  placeholder="Enter your password"
                />

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Reset Password</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>

                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  required
                  placeholder="admin@klgreens.com"
                />

                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setError('');
                      setSuccess('');
                    }}
                    disabled={forgotPasswordLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={forgotPasswordLoading}
                  >
                    {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </div>
              </form>
            )}

            {!showForgotPassword && (
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 mb-2">Don't have an admin account?</p>
                <a
                  href="/admin-signup"
                  className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                >
                  Create Admin Account
                </a>
              </div>
            )}
          </div>
        </Card>

        <p className="text-center mt-6 text-white text-sm drop-shadow-md">
          Trainmice Admin Dashboard &copy; 2025
        </p>
      </div>
    </div>
  );
};
