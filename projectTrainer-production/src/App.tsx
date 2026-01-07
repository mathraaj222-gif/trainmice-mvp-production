import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { MyCalendar } from './pages/MyCalendar';
import { Analytics } from './pages/Analytics';
import { MyCourses } from './pages/MyCourses';
import { TrainerProfile } from './pages/TrainerProfile';
import { MessageAdmin } from './pages/MessageAdmin';
import { CourseMaterials } from './pages/CourseMaterials';
import { EventOverlook } from './pages/EventOverlook';
import { Notifications } from './pages/Notifications';
import { Messages } from './pages/Messages';
import { VerifyEmailSuccess } from './pages/VerifyEmailSuccess';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email-success" element={<VerifyEmailSuccess />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="calendar" element={<MyCalendar />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="courses" element={<MyCourses />} />
            <Route path="courses/:courseId/materials" element={<CourseMaterials />} />
            <Route path="events" element={<EventOverlook />} />
            <Route path="message-admin" element={<MessageAdmin />} />
            <Route path="messages" element={<Messages />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<TrainerProfile />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
