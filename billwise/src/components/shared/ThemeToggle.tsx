import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../../store/themeStore'

interface ThemeToggleProps {
  className?: string
}

/** Accessible light/dark switch with a spring icon swap. */
export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="relative p-2 rounded-xl text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-all duration-200 active:scale-90"
    >
      <span className={`block transition-all duration-300 ease-spring ${className}`}>
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </span>
    </button>
  )
}
