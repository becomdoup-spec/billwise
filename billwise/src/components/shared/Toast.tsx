import { create } from 'zustand'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: Toast[]
  add: (message: string, type?: ToastType) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  error: (msg: string) => useToastStore.getState().add(msg, 'error'),
  info: (msg: string) => useToastStore.getState().add(msg, 'info'),
}

const icons = {
  success: <CheckCircle size={16} className="text-success shrink-0" />,
  error: <AlertCircle size={16} className="text-danger shrink-0" />,
  info: <Info size={16} className="text-primary shrink-0" />,
}

const accents = {
  success: 'border-success/30',
  error: 'border-danger/30',
  info: 'border-primary/30',
}

function ToastItem({ toast: t }: { toast: Toast }) {
  const remove = useToastStore((state) => state.remove)
  const [leaving, setLeaving] = useState(false)
  const leaveTimerRef = useRef<number>(0)

  const beginRemove = useCallback(() => {
    if (leaveTimerRef.current) return
    setLeaving(true)
    leaveTimerRef.current = window.setTimeout(() => remove(t.id), 160)
  }, [remove, t.id])

  useEffect(() => {
    const timer = window.setTimeout(beginRemove, 3500)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(leaveTimerRef.current)
    }
  }, [beginRemove])

  return (
    <div
      role={t.type === 'error' ? 'alert' : 'status'}
      className={`flex min-h-11 items-start gap-3 rounded-2xl border bg-surface-raised px-4 py-3 shadow-overlay animate-slide-up transition-[opacity,transform] duration-150 ${accents[t.type]} ${leaving ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
    >
      {icons[t.type]}
      <span className="text-sm text-fg flex-1 leading-snug">{t.message}</span>
      <button onClick={beginRemove} aria-label="Dismiss notification" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-overlay hover:text-fg">
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  return (
    <div
      className="fixed left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 pointer-events-none"
      style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  )
}
