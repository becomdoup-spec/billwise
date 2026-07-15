import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface LayoutProps {
  children: ReactNode
  className?: string
}

export function Layout({ children, className = '' }: LayoutProps) {
  const cloudSyncError = useAppStore((state) => state.cloudSyncError)

  return (
    <div
      className={`h-[100dvh] min-h-[100svh] overflow-hidden text-fg font-sans ${className}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
        {children}
      </div>
      {cloudSyncError && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-[max(env(safe-area-inset-top),0.5rem)] z-[90] flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-xl border border-warning/30 bg-surface-raised px-3 py-2 text-xs font-medium text-warning shadow-overlay animate-slide-up"
        >
          <Loader2 size={13} className="animate-spin" />
          Reconnecting…
        </div>
      )}
    </div>
  )
}
