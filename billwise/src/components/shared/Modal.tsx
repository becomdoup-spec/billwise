import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  dismissible?: boolean
}

export function Modal({ open, onClose, title, children, size = 'md', dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open || !dismissible) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dismissible, open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={dismissible ? onClose : undefined}
      />
      <div className={`relative w-full ${widths[size]} bg-surface-raised rounded-3xl border border-line shadow-overlay animate-slide-up overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-fg tracking-tight">{title}</h2>
          {dismissible && (
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-colors duration-200"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
