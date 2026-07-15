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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = 'theme-menu'
  const themes = GROUPS.flatMap((group) => group.themes)

  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openMenu = (index = themes.indexOf(theme)) => {
    setOpen(true)
    window.requestAnimationFrame(() => itemRefs.current[Math.max(index, 0)]?.focus())
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const handleItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }

    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (direction) {
      event.preventDefault()
      itemRefs.current[(index + direction + themes.length) % themes.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      itemRefs.current[themes.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      closeMenu()
    }
  }

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); openMenu() }
          if (event.key === 'ArrowUp') { event.preventDefault(); openMenu(themes.length - 1) }
          if (event.key === 'Escape' && open) { event.preventDefault(); closeMenu(true) }
        }}
        aria-label="Choose theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Choose theme"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-fg-subtle transition-[color,background-color,transform] duration-150 hover:bg-surface-overlay hover:text-fg active:scale-95"
      >
        {/* Current theme swatch dot */}
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-1 ring-surface-raised"
          style={{ background: THEME_META[theme].swatch }}
        />
        <Palette size={18} />
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Choose theme" className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-overlay animate-menu-in">
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-faint">Theme</p>
          </div>
          {GROUPS.map((group) => (
            <div key={group.label} className="px-2 pb-2">
              <p className="text-[10px] font-medium text-fg-faint px-1 pt-1.5 pb-1 uppercase tracking-wider">{group.label}</p>
              <div role="group" aria-label={`${group.label} themes`} className="grid grid-cols-3 gap-1">
                {group.themes.map((t) => {
                  const meta = THEME_META[t]
                  const active = theme === t
                  const index = themes.indexOf(t)
                  return (
                    <button
                      key={t}
                      ref={(element) => { itemRefs.current[index] = element }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => { setTheme(t); closeMenu(true) }}
                      onKeyDown={(event) => handleItemKeyDown(event, index)}
                      className={clsx(
                        'flex min-h-11 items-center gap-1.5 rounded-xl px-2 py-2 text-left transition-[background-color,box-shadow] duration-150',
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
