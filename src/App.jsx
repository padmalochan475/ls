import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Scheduler from './pages/Scheduler';
import AdminPanel from './pages/AdminPanel';
import MasterData from './pages/MasterData';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) return <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Check for pending status
  if (userProfile && userProfile.status === 'pending') {
    return (
      <div className="glass-panel" style={{ margin: '2rem', padding: '2rem', textAlign: 'center', color: 'white' }}>
        <h1>Account Pending</h1>
        <p>Your account is waiting for admin approval. Please check back later.</p>
        <button className="btn" onClick={() => window.location.reload()} style={{ marginTop: '1rem', background: 'var(--color-accent)' }}>Check Status</button>
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
    <AuthProvider>
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
                <div className="glass-panel" style={{ padding: '2rem' }}><h2>Assignments Component Placeholder</h2></div>
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
                <div className="glass-panel" style={{ padding: '2rem' }}><h2>Analytics Component Placeholder</h2></div>
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
