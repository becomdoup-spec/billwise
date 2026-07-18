import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  onCloseRef.current = onClose

  useEffect(() => {
    let frame = 0
    let timer = 0

    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
      setMounted(true)
      frame = window.requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
      timer = window.setTimeout(() => {
        setMounted(false)
        previousFocusRef.current?.focus()
      }, 280)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open || !mounted) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const focusTimer = window.setTimeout(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(preferred ?? first ?? panelRef.current)?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [dismissible, mounted, open])

  if (!mounted) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4"
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={dismissible ? () => onCloseRef.current() : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100dvh-0.5rem)] w-full ${widths[size]} flex-col overflow-hidden rounded-t-2xl border border-line bg-surface-raised shadow-overlay transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:duration-[260ms] ${visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-100 opacity-0 sm:translate-y-2 sm:scale-[0.97]'}`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-line">
          <h2 id={titleId} className="text-base font-semibold text-fg tracking-tight">{title}</h2>
          {dismissible && (
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close dialog"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-subtle transition-colors duration-150 hover:bg-surface-overlay hover:text-fg"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
