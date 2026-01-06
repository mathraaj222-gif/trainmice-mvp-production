import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, Menu, X } from 'lucide-react';
import { auth, type User as AuthUser } from '../lib/auth';
import trainMICELogo from '../TrainMICE logo.png';

type HeaderProps = {
  onLoginClick: () => void;
  onSignupClick: () => void;
};

export function Header({ onLoginClick, onSignupClick }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Get initial session
    auth.getSession().then(({ user }) => {
      setUser(user);
      if (user) {
        fetchUserName(user.id);
      }
    });

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChange((user) => {
      setUser(user);
      if (user) {
        fetchUserName(user.id);
      } else {
        setUserName('');
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchUserName = async (_userId: string) => {
    // Use fullName from user object directly
    if (user?.fullName) {
      setUserName(user.fullName);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    setUser(null);
    setUserName('');
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Navigation - Centered */}
          <div className="flex items-center justify-center flex-1 gap-6">
            <a href="/" className="flex items-center">
              <img 
                src={trainMICELogo} 
                alt="TrainMICE Logo" 
                className="h-10 w-auto"
              />
            </a>

            {/* Navigation Links - Centered */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => navigate('/')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive('/')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Courses
              </button>
              <button
                onClick={() => navigate('/request-custom-course')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive('/request-custom-course')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Request Custom Courses
              </button>
              <button
                onClick={() => navigate('/contact-us')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive('/contact-us')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Contact Us
              </button>
            </nav>
          </div>

          {/* User Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* User Profile - Icon with Name */}
                <div className="flex items-center gap-2 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 rounded-lg transition-colors">
                  <User className="w-5 h-5 text-gray-900" />
                  <span className="text-sm font-medium text-gray-900">
                    {userName}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onLoginClick}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Log In
                </button>
                <button
                  onClick={onSignupClick}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                >
                  Sign Up
                </button>
              </>
            )}
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col gap-2">
              <button
                onClick={() => {
                  navigate('/');
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-2 text-left text-sm font-medium rounded-lg ${
                  isActive('/') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Courses
              </button>
              <button
                onClick={() => {
                  navigate('/request-custom-course');
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-2 text-left text-sm font-medium rounded-lg ${
                  isActive('/request-custom-course')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Request Custom Courses
              </button>
              <button
                onClick={() => {
                  navigate('/contact-us');
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-2 text-left text-sm font-medium rounded-lg ${
                  isActive('/contact-us')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Contact Us
              </button>
              {user && (
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  Log Out
                </button>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
