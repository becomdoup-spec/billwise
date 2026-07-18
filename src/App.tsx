import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { AuthPage } from './pages/AuthPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { NewSessionPage } from './pages/NewSessionPage'
import { SessionPage } from './pages/SessionPage'
import { UserDashboard } from './pages/UserDashboard'
import { JoinGroupPage } from './pages/JoinGroupPage'
import { ToastContainer } from './components/shared/Toast'
import { DoorTransitionOverlay } from './components/shared/DoorTransition'
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

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<div className="page-enter"><AuthPage /></div>} />
      <Route path="/join/:code" element={<div className="page-enter"><JoinGroupPage /></div>} />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <div className="page-enter"><AdminDashboard /></div>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/new-session"
        element={
          <RequireAuth role="admin">
            <div className="page-enter"><NewSessionPage /></div>
          </RequireAuth>
        }
      />
      <Route
        path="/user/new-session"
        element={
          <RequireAuth>
            <div className="page-enter"><NewSessionPage /></div>
          </RequireAuth>
        }
      />
      <Route
        path="/session/:id"
        element={
          <RequireAuth>
            <div className="page-enter"><SessionPage /></div>
          </RequireAuth>
        }
      />
      <Route
        path="/user"
        element={
          <RequireAuth>
            <div className="page-enter"><UserDashboard /></div>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  useSupabaseInit()
  return (
    <BrowserRouter>
      <AnimatedRoutes />
      <DoorTransitionOverlay />
      <ToastContainer />
      <Analytics />
    </BrowserRouter>
  )
}
