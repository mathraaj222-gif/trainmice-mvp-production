import React from 'react';
import {
  Home,
  MessageSquare,
  Users,
  BookOpen,
  FileText,
  Calendar,
  Settings,
  Activity,
  LogOut,
  BarChart3,
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'trainers', label: 'Trainers', icon: Users },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'custom-requests', label: 'Course Requests', icon: FileText },
    { id: 'bookings', label: 'Bookings', icon: Calendar },
    { id: 'feedback-analytics', label: 'Feedback Analytics', icon: BarChart3 },
    { id: 'admin-logs', label: 'Admin Logs', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-gradient-to-b from-white to-green-600 text-gray-800 h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-green-200 flex items-center justify-center">
        <img
          src="/TrainmiceTwinleaf.png"
          alt="Trainmice"
          className="h-32 w-auto object-contain"
        />
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-gray-700 hover:bg-green-100'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-green-200">
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-red-100 hover:text-red-600 transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};
