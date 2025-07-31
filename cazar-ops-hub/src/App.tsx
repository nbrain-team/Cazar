import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { MainLayout } from './components/MainLayout';
import { AuthLayout } from './components/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TimecardPage from './pages/TimecardPage';
import SchedulingPage from './pages/SchedulingPage';
import DriversPage from './pages/DriversPage';
import ReportsPage from './pages/ReportsPage';
import PayrollPage from './pages/PayrollPage';
import SettingsPage from './pages/SettingsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Auth routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Protected routes */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/timecard" element={<TimecardPage />} />
                      <Route path="/scheduling" element={<SchedulingPage />} />
                      <Route path="/drivers" element={<DriversPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/payroll" element={<PayrollPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="*" element={<Navigate to="/dashboard" />} />
                    </Routes>
                  </MainLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
