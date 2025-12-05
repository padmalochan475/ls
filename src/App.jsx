import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MasterDataProvider } from './contexts/MasterDataContext';
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

const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, userProfile, loading, logout } = useAuth();

  if (loading) return <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Wait for profile to load if user is logged in
  if (!userProfile) {
    return <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Profile...</div>;
  }

  // Check for pending status
  if (userProfile && userProfile.status === 'pending') {
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
  if (requiredRole && userProfile && userProfile.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MasterDataProvider>
          <Router>
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
                <ProtectedRoute>
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
        </MasterDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
