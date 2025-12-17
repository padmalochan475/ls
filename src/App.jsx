import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MasterDataProvider } from './contexts/MasterDataContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Scheduler from './pages/Scheduler';
import AdminPanel from './pages/AdminPanel';
import MasterData from './pages/MasterData';
import Profile from './pages/Profile';
import Assignments from './pages/Assignments';
import ErrorBoundary from './components/ErrorBoundary';
import Analytics from './pages/Analytics';
import ConfirmModal from './components/ConfirmModal';
import OfflineAlert from './components/OfflineAlert';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { userProfile, loading, logout } = useAuth();
  const location = useLocation();


  if (loading) return <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;

  if (!userProfile) {
    // In a real app, you might redirect to login if no user, but useAuth handles initial load.
    // If we are here, loading is false, but userProfile is null => Not logged in?
    // AuthProvider usually provides currentUser. 
    // Let's rely on currentUser check from previous version.
    // BUT, let's keep it simple. If loading is false and no profile, Redirect.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Check for pending status
  if (userProfile.status === 'pending') {
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

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MasterDataProvider>
          <NotificationProvider>
            <Toaster position="top-right" toastOptions={{
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)'
              }
            }} />
            <Router>
              <OfflineAlert />
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/schedule" element={
                  <ProtectedRoute>
                    <Layout>
                      <Scheduler />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/assignments" element={
                  <ProtectedRoute>
                    <Layout>
                      <Assignments />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/master-data" element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <MasterData />
                    </Layout>
                  </ProtectedRoute>
                } />


                <Route path="/analytics" element={
                  <ProtectedRoute>
                    <Layout>
                      <Analytics />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/admin" element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <AdminPanel />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/profile" element={
                  <ProtectedRoute>
                    <Layout>
                      <Profile />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </NotificationProvider>
        </MasterDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
