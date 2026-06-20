import { ArrowLeft, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'

interface HeaderProps {
  title: string
  subtitle?: string
  back?: boolean
  onBack?: () => void
  showLogout?: boolean
  rightAction?: React.ReactNode
}

export function Header({ title, subtitle, back, onBack, showLogout, rightAction }: HeaderProps) {
  const navigate = useNavigate()
  const { currentUser, setCurrentUser } = useAppStore()

  const handleBack = () => {
    if (onBack) { onBack(); return }
    navigate(-1)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur-md border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-white hover:bg-surface-2 transition-all active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500 truncate mt-0.5">{subtitle}</p>}
        </div>
        {rightAction}
        {showLogout && currentUser && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 hidden sm:block">
              {currentUser.name}
            </span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-surface-2 transition-all active:scale-95"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
