import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export function VerifyEmailSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // Show success message for 2 seconds, then redirect to home page
    const timer = setTimeout(() => {
      navigate('/');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
        <p className="text-gray-600 mb-6">
          Your email address has been successfully verified. Your account is now active.
        </p>
        <p className="text-sm text-gray-500">
          This window will close automatically...
        </p>
      </div>
    </div>
  );
}

