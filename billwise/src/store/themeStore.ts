import { create } from 'zustand'

export type Theme =
  | 'light'
  | 'dark'
  | 'gold'
  | 'gold-silver'
  | 'silver'
  | 'yellow-black'
  | 'orange-black'
  | 'orange-white'
  | 'yellow-white'
  | 'blue-white'
  | 'blue-dark'
  | 'aurora'
  | 'minimal'

export const DARK_THEMES: Theme[] = ['dark', 'gold', 'yellow-black', 'orange-black', 'blue-dark', 'aurora']

export interface ThemeMeta {
  label: string
  swatch: string   // hex for the picker dot
  group: 'dark' | 'light' | 'special'
}

export const THEME_META: Record<Theme, ThemeMeta> = {
  dark:          { label: 'Dark',         swatch: '#2DD4BF', group: 'dark'    },
  light:         { label: 'Light',        swatch: '#0D9488', group: 'light'   },
  gold:          { label: 'Gold',         swatch: '#F5C518', group: 'dark'    },
  'gold-silver': { label: 'Gold & Silver',swatch: '#B49114', group: 'light'   },
  silver:        { label: 'Silver',       swatch: '#64748B', group: 'light'   },
  'yellow-black':{ label: 'Yellow Night', swatch: '#FACC15', group: 'dark'    },
  'orange-black':{ label: 'Orange Night', swatch: '#F97316', group: 'dark'    },
  'orange-white':{ label: 'Orange Day',   swatch: '#EA580C', group: 'light'   },
  'yellow-white':{ label: 'Yellow Day',   swatch: '#CA8A04', group: 'light'   },
  'blue-white':  { label: 'Ocean Day',    swatch: '#2563EB', group: 'light'   },
  'blue-dark':   { label: 'Ocean Night',  swatch: '#60A5FA', group: 'dark'    },
  aurora:        { label: 'Aurora',       swatch: '#A855F7', group: 'special' },
  minimal:       { label: 'Minimal',      swatch: '#475569', group: 'special' },
}

const STORAGE_KEY = 'billwise-theme'

function isValidTheme(v: string | null): v is Theme {
  return !!v && v in THEME_META
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (isValidTheme(saved)) return saved
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches
  return prefersLight ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.theme = theme
  el.classList.toggle('dark', DARK_THEMES.includes(theme))
}

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
    set({ theme })
  },
}))

// Apply immediately on module load so there's no flash before React mounts.
applyTheme(useThemeStore.getState().theme)
