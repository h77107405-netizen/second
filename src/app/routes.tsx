import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { AdminLayout } from './components/layout/AdminLayout';
import { TeacherLayout } from './components/layout/TeacherLayout';
import { StudentLayout } from './components/layout/StudentLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { StudentsPage } from './pages/admin/StudentsPage';
import { TeachersPage } from './pages/admin/TeachersPage';
import { CoursesPage } from './pages/admin/CoursesPage';
import { BatchesPage } from './pages/admin/BatchesPage';
import { AdminMaterialsPage } from './pages/admin/AdminMaterialsPage';
import { AdminTestsPage } from './pages/admin/AdminTestsPage';
import { FeesPage } from './pages/admin/FeesPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { NotificationBroadcastPage } from './pages/admin/NotificationBroadcastPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { MyBatchesPage } from './pages/teacher/MyBatchesPage';
import { TeacherMaterialsPage } from './pages/teacher/TeacherMaterialsPage';
import { LiveClassesPage } from './pages/teacher/LiveClassesPage';
import { TeacherTestsPage } from './pages/teacher/TeacherTestsPage';
import { AssignmentsPage } from './pages/teacher/AssignmentsPage';
import { DoubtsPage } from './pages/teacher/DoubtsPage';
import { AnalyticsPage } from './pages/teacher/AnalyticsPage';
import { TeacherProfilePage } from './pages/teacher/TeacherProfilePage';
import { StudentProgressPage } from './pages/teacher/StudentProgressPage';
import { AttendancePage } from './pages/teacher/AttendancePage';
import { NotificationsPage } from './pages/student/NotificationsPage';
import { AdminLiveClassesPage } from './pages/admin/AdminLiveClassesPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { CoursesPage as StudentCoursesPage } from './pages/student/CoursesPage';
import { MaterialsPage } from './pages/student/MaterialsPage';
import { StudentLiveClassesPage } from './pages/student/StudentLiveClassesPage';
import { StudentTestsPage } from './pages/student/StudentTestsPage';
import { ResultsPage } from './pages/student/ResultsPage';
import { StudentAssignmentsPage } from './pages/student/StudentAssignmentsPage';
import { StudentDoubtsPage } from './pages/student/StudentDoubtsPage';
import { StudentFeesPage } from './pages/student/StudentFeesPage';
import { ProfilePage } from './pages/student/ProfilePage';

const UnauthorizedPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
      <h1 className="text-2xl font-semibold">Unauthorized</h1>
      <p className="mt-2 text-sm text-gray-600">You do not have access to this area.</p>
      <Navigate to="/login" replace />
    </div>
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
};

const LoginRoute = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'teacher') return <Navigate to="/teacher" replace />;
    if (user.role === 'student') return <Navigate to="/student" replace />;
  }

  return <LoginPage />;
};

const RootRedirect = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'teacher') return <Navigate to="/teacher" replace />;
  if (user.role === 'student') return <Navigate to="/student" replace />;

  return <Navigate to="/login" replace />;
};

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginRoute /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'students', element: <StudentsPage /> },
      { path: 'teachers', element: <TeachersPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'batches', element: <BatchesPage /> },
      { path: 'materials', element: <AdminMaterialsPage /> },
      { path: 'tests', element: <AdminTestsPage /> },
      { path: 'fees', element: <FeesPage /> },
      { path: 'broadcast', element: <NotificationBroadcastPage /> },
      { path: 'live-classes', element: <AdminLiveClassesPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '/teacher',
    element: (
      <ProtectedRoute allowedRoles={['teacher']}>
        <TeacherLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <TeacherDashboard /> },
      { path: 'batches', element: <MyBatchesPage /> },
      { path: 'materials', element: <TeacherMaterialsPage /> },
      { path: 'classes', element: <LiveClassesPage /> },
      { path: 'tests', element: <TeacherTestsPage /> },
      { path: 'assignments', element: <AssignmentsPage /> },
      { path: 'doubts', element: <DoubtsPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'progress', element: <StudentProgressPage /> },
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'profile', element: <TeacherProfilePage /> },
    ],
  },
  {
    path: '/student',
    element: (
      <ProtectedRoute allowedRoles={['student']}>
        <StudentLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <StudentDashboard /> },
      { path: 'courses', element: <StudentCoursesPage /> },
      { path: 'materials', element: <MaterialsPage /> },
      { path: 'classes', element: <StudentLiveClassesPage /> },
      { path: 'tests', element: <StudentTestsPage /> },
      { path: 'results', element: <ResultsPage /> },
      { path: 'assignments', element: <StudentAssignmentsPage /> },
      { path: 'doubts', element: <StudentDoubtsPage /> },
      { path: 'fees', element: <StudentFeesPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);
