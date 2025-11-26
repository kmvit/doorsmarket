import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ComplaintList from './pages/Complaints/ComplaintList'
import ComplaintDetail from './pages/Complaints/ComplaintDetail'
import ComplaintCreate from './pages/Complaints/ComplaintCreate'
import ComplaintEdit from './pages/Complaints/ComplaintEdit'
import ComplaintProcess from './pages/Complaints/ComplaintProcess'
import ComplaintHistory from './pages/Complaints/ComplaintHistory'
import InstallerTasks from './pages/InstallerTasks'
import ShippingRegistryPage from './pages/ShippingRegistry'
import ShippingRegistryDetail from './pages/ShippingRegistryDetail'
import ManagerProduction from './pages/ManagerProduction'
import Notifications from './pages/Notifications'
import Offline from './pages/Offline'
import ProtectedRoute from './components/common/ProtectedRoute'
import Layout from './components/layout/Layout'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Router>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/complaints"
          element={
            <ProtectedRoute>
              <Layout>
                <ComplaintList />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/complaints/create"
          element={
            <ProtectedRoute>
              <Layout>
                <ComplaintCreate />
              </Layout>
            </ProtectedRoute>
          }
        />
              <Route
                path="/complaints/:id"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ComplaintDetail />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/complaints/:id/edit"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ComplaintEdit />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/complaints/:id/process"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ComplaintProcess />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/complaints/:id/history"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ComplaintHistory />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/installer/planning"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <InstallerTasks />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/shipping-registry"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ShippingRegistryPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/shipping-registry/:id"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ShippingRegistryDetail />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manager/production"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ManagerProduction />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Notifications />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route path="/offline" element={<Offline />} />
              <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  )
}

export default App

