import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { AuthPage } from './pages/AuthPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { NewSessionPage } from './pages/NewSessionPage'
import { SessionPage } from './pages/SessionPage'
import { UserDashboard } from './pages/UserDashboard'
import { ToastContainer } from './components/shared/Toast'
import { useAppStore } from './store/appStore'
import { useSupabaseInit } from './hooks/useSupabaseInit'

function RequireAuth({ role, children }: { role?: 'admin' | 'user'; children: JSX.Element }) {
  const { currentUser } = useAppStore()
  if (!currentUser) return <Navigate to="/" replace />
  if (role && currentUser.role !== role) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/user'} replace />
  }
  return children
}

export default function App() {
  useSupabaseInit()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth role="admin">
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/new-session"
          element={
            <RequireAuth role="admin">
              <NewSessionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/user/new-session"
          element={
            <RequireAuth>
              <NewSessionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/session/:id"
          element={
            <RequireAuth>
              <SessionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/user"
          element={
            <RequireAuth>
              <UserDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
      <Analytics />
    </BrowserRouter>
  )
}
