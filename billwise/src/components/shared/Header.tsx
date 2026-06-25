import { ArrowLeft, LogOut, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  title: string
  subtitle?: string
  back?: boolean
  onBack?: () => void
  showLogout?: boolean
  showExit?: boolean
  rightAction?: React.ReactNode
}

export function Header({ title, subtitle, back, onBack, showLogout, showExit, rightAction }: HeaderProps) {
  const navigate = useNavigate()
  const { currentUser, setCurrentUser } = useAppStore()

  const handleBack = () => {
    if (onBack) { onBack(); return }
    navigate(-1)
  }

  const handleExit = () => {
    if (currentUser?.role === 'admin') {
      navigate('/admin')
    } else {
      navigate('/user')
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-canvas/80 backdrop-blur-xl border-b border-line px-4 py-3">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={handleBack}
            aria-label="Go back"
            className="p-2 -ml-2 rounded-xl text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-all duration-200 active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-fg truncate tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-fg-subtle truncate mt-0.5">{subtitle}</p>}
        </div>
        {rightAction}
        <ThemeToggle />
        {showLogout && currentUser && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-subtle hidden sm:block">
              {currentUser.name}
            </span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-all duration-200 active:scale-95"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
        {showExit && (
          <button
            onClick={handleExit}
            aria-label="Exit to dashboard"
            title="Back to dashboard"
            className="p-2 rounded-xl text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-all duration-200 active:scale-95"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
