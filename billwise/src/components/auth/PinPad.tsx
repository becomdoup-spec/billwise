import { useState, useEffect, useRef } from 'react'
import { Delete } from 'lucide-react'
import clsx from 'clsx'

interface PinPadProps {
  onComplete: (pin: string) => void
  error?: string
  label?: string
  maxLength?: number
}

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export function PinPad({ onComplete, error, label, maxLength = 6 }: PinPadProps) {
  const [pin, setPin] = useState('')
  const pinRef = useRef(pin)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (error) {
      setShake(true)
      setPin('')
      pinRef.current = ''
      const t = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(t)
    }
  }, [error])

  const handleKey = (key: string) => {
    if (key === 'del') {
      setPin((p) => { const v = p.slice(0, -1); pinRef.current = v; return v })
      return
    }
    if (!key) return
    const next = pinRef.current + key
    if (next.length > maxLength) return
    pinRef.current = next
    setPin(next)
    if (next.length === maxLength) {
      onCompleteRef.current(next)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('del')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [maxLength])

  return (
    <div className="flex flex-col items-center gap-6">
      {label && <p className="text-sm text-fg-muted">{label}</p>}

      {/* PIN dots */}
      <div className={clsx('flex gap-3 transition-all', shake && 'animate-[shake_0.4s_ease-in-out]')}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              'w-3.5 h-3.5 rounded-full border-2 transition-all duration-200',
              i < pin.length
                ? 'bg-primary border-primary scale-110'
                : 'bg-transparent border-line-strong',
            )}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-danger text-center animate-fade-in -mt-2">{error}</p>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
        {PAD.map((key, idx) => {
          if (!key) return <div key={idx} />
          return (
            <button
              key={key + idx}
              onClick={() => handleKey(key)}
              aria-label={key === 'del' ? 'Delete' : `Digit ${key}`}
              className={clsx(
                'h-14 rounded-2xl text-lg font-medium transition-all duration-150 active:scale-90',
                key === 'del'
                  ? 'bg-surface-overlay border border-line text-fg-muted hover:text-fg hover:bg-surface-hover'
                  : 'bg-surface border border-line text-fg hover:bg-surface-overlay hover:border-line-strong',
              )}
            >
              {key === 'del' ? <Delete size={18} className="mx-auto" /> : key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
