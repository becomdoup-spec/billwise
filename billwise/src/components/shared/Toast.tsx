import { create } from 'zustand'
import { useEffect } from 'react'
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
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
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

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 3500)
    return () => clearTimeout(timer)
  }, [onRemove])

  return (
    <div
      role="status"
      className={`flex items-start gap-3 bg-surface-raised border ${accents[t.type]} rounded-2xl px-4 py-3 shadow-overlay animate-slide-up`}
    >
      {icons[t.type]}
      <span className="text-sm text-fg flex-1 leading-snug">{t.message}</span>
      <button onClick={onRemove} aria-label="Dismiss" className="text-fg-faint hover:text-fg transition-colors mt-0.5">
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, remove } = useToastStore()
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={() => remove(t.id)} />
        </div>
      ))}
    </div>
  )
}
