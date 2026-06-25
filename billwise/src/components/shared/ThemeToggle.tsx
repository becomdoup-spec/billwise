import { useEffect, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { useThemeStore, THEME_META, type Theme } from '../../store/themeStore'
import clsx from 'clsx'

const GROUPS: { label: string; themes: Theme[] }[] = [
  { label: 'Dark',    themes: ['dark', 'gold', 'yellow-black', 'orange-black', 'blue-dark', 'aurora'] },
  { label: 'Light',   themes: ['light', 'gold-silver', 'silver', 'orange-white', 'yellow-white', 'blue-white'] },
  { label: 'Special', themes: ['minimal'] },
]

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose theme"
        title="Choose theme"
        className="relative p-2 rounded-xl text-fg-subtle hover:text-fg hover:bg-surface-overlay transition-all duration-200 active:scale-90"
      >
        {/* Current theme swatch dot */}
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-1 ring-surface-raised"
          style={{ background: THEME_META[theme].swatch }}
        />
        <Palette size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-line bg-surface-raised shadow-overlay animate-pop overflow-hidden">
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-faint">Theme</p>
          </div>
          {GROUPS.map((group) => (
            <div key={group.label} className="px-2 pb-2">
              <p className="text-[10px] font-medium text-fg-faint px-1 pt-1.5 pb-1 uppercase tracking-wider">{group.label}</p>
              <div className="grid grid-cols-3 gap-1">
                {group.themes.map((t) => {
                  const meta = THEME_META[t]
                  const active = theme === t
                  return (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setOpen(false) }}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-all',
                        active
                          ? 'bg-surface-overlay ring-1 ring-primary/40'
                          : 'hover:bg-surface-overlay',
                      )}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10"
                        style={{ background: meta.swatch }}
                      />
                      <span className={clsx(
                        'text-[11px] leading-none truncate',
                        active ? 'text-fg font-semibold' : 'text-fg-muted',
                      )}>
                        {meta.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
