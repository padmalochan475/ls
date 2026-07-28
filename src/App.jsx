import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MasterDataProvider, useMasterData } from './contexts/MasterDataContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useScheduleData } from './hooks/useScheduleData';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import React, { Suspense } from 'react';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Login = React.lazy(() => import('./pages/Login'));
const Scheduler = React.lazy(() => import('./pages/Scheduler'));
const PublicView = React.lazy(() => import('./pages/PublicView'));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'));
const MasterData = React.lazy(() => import('./pages/MasterData'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Assignments = React.lazy(() => import('./pages/Assignments'));
const Suggestions = React.lazy(() => import('./pages/Suggestions'));
const Substitutions = React.lazy(() => import('./pages/Substitutions'));
const Students = React.lazy(() => import('./pages/students/index'));
const Resources = React.lazy(() => import('./pages/Resources'));
const Syllabus = React.lazy(() => import('./pages/Syllabus'));
const Analytics = React.lazy(() => import('./pages/Analytics'));
const Certificates = React.lazy(() => import('./pages/Certificates'));
const ApplyCertificate = React.lazy(() => import('./pages/ApplyCertificate'));

import ErrorBoundary from './components/ErrorBoundary';

import OfflineAlert from './components/OfflineAlert';

import QuantumLoader from './components/QuantumLoader';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { userProfile, loading, logout } = useAuth();
  const { loading: masterLoading } = useMasterData();
  const { loading: scheduleLoading } = useScheduleData();
  const location = useLocation();

  if (loading || masterLoading || scheduleLoading) return <QuantumLoader />;

  if (!userProfile) {
    // In a real app, you might redirect to login if no user, but useAuth handles initial load.
    // If we are here, loading is false, but userProfile is null => Not logged in?
    // AuthProvider usually provides currentUser. 
    // Let's rely on currentUser check from previous version.
    // BUT, let's keep it simple. If loading is false and no profile, Redirect.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Check for pending status
  if (userProfile.status?.toLowerCase() === 'pending') {
    return (
      <div className="glass-panel" style={{ margin: '2rem', padding: '2rem', textAlign: 'center', color: 'white' }}>
        <h1>Account Pending</h1>
        <p>Your account is waiting for admin approval. Please check back later.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
          <button className="btn" onClick={() => window.location.reload()} style={{ background: 'var(--color-accent)' }}>Check Status</button>
          <button className="btn" onClick={logout} style={{ background: 'rgba(255,255,255,0.1)' }}>Logout</button>
        </div>
      </div>
    );
  }

  // Check for role requirement
  if (requiredRole && userProfile.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};


import { ScheduleProvider } from './contexts/ScheduleContext';
import VersionManager from './components/VersionManager';

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <Router>
        <Suspense fallback={<QuantumLoader />}>
          <Routes>
            {/* 1. Public Routes (Zero-Init / Firebase Independent) */}
            <Route path="/apply-certificate" element={<ApplyCertificate />} />
            <Route path="/view" element={<PublicView />} />

            {/* 2. Protected Internal App (Firebase Dependent) */}
            <Route path="*" element={
              <AuthProvider>
                <MasterDataProvider>
                  <NotificationProvider>
                    <ScheduleProvider>
                      <VersionManager />
                      <OfflineAlert />
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
                        <Route path="/schedule" element={<ProtectedRoute><Layout><Scheduler /></Layout></ProtectedRoute>} />
                        <Route path="/assignments" element={<ProtectedRoute><Layout><Assignments /></Layout></ProtectedRoute>} />
                        <Route path="/master-data" element={<ProtectedRoute requiredRole="admin"><Layout><MasterData /></Layout></ProtectedRoute>} />
                        <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
                        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Layout><AdminPanel /></Layout></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
                        <Route path="/suggestions" element={<ProtectedRoute><Layout><Suggestions /></Layout></ProtectedRoute>} />
                        <Route path="/substitutions" element={<ProtectedRoute><Layout><Substitutions /></Layout></ProtectedRoute>} />
                        <Route path="/students" element={<ProtectedRoute><Layout><Students /></Layout></ProtectedRoute>} />
                        <Route path="/resources" element={<ProtectedRoute><Layout><Resources /></Layout></ProtectedRoute>} />
                        <Route path="/syllabus" element={<ProtectedRoute><Layout><Syllabus /></Layout></ProtectedRoute>} />
                        <Route path="/certificates" element={<ProtectedRoute requiredRole="admin"><Layout><Certificates /></Layout></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </ScheduleProvider>
                  </NotificationProvider>
                </MasterDataProvider>
              </AuthProvider>
            } />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
