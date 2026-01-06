import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';

export function VerifyEmailSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // Show success message for 2 seconds, then redirect to login page
    const timer = setTimeout(() => {
      navigate('/login');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
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
        </CardContent>
      </Card>
    </div>
  );
}

