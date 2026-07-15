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

const USER_THEME_KEY = 'billwise-theme'
const ADMIN_DEFAULT_THEME_KEY = 'billwise-admin-default-theme'

function isValidTheme(v: string | null): v is Theme {
  return !!v && v in THEME_META
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  // User's own saved preference takes priority
  const userSaved = window.localStorage.getItem(USER_THEME_KEY)
  if (isValidTheme(userSaved)) return userSaved
  // Admin-configured default theme is next
  const adminDefault = window.localStorage.getItem(ADMIN_DEFAULT_THEME_KEY)
  if (isValidTheme(adminDefault)) return adminDefault
  // Fall back to light (not system dark) as app default
  return 'light'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.theme = theme
  el.classList.toggle('dark', DARK_THEMES.includes(theme))
}

/** Called after Supabase hydration — applies admin default to users who haven't set their own theme */
export function applyAdminDefaultTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ADMIN_DEFAULT_THEME_KEY, theme)
  const userSaved = window.localStorage.getItem(USER_THEME_KEY)
  if (!isValidTheme(userSaved)) {
    // User has no personal preference — apply admin default
    applyTheme(theme)
    useThemeStore.setState({ theme })
  }
}

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    window.localStorage.setItem(USER_THEME_KEY, theme)
    set({ theme })
  },
}))

// Apply immediately on module load so there's no flash before React mounts.
applyTheme(useThemeStore.getState().theme)
