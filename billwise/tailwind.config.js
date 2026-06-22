/** @type {import('tailwindcss').Config} */

/* ──────────────────────────────────────────────────────────────
   BillWise design tokens
   Colours are driven by CSS custom properties (see src/index.css)
   so the entire system flips between light & dark themes with a
   single class on <html>. Every token is space-separated RGB to
   keep Tailwind's `/<alpha-value>` opacity modifiers working
   (e.g. bg-primary/10, border-success/25).
   ────────────────────────────────────────────────────────────── */

const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Elevation ladder — page → card → raised → control */
        canvas: withVar('--canvas'),
        surface: {
          DEFAULT: withVar('--surface'),
          raised: withVar('--surface-raised'),
          overlay: withVar('--surface-overlay'),
          hover: withVar('--surface-hover'),
        },

        /* Text */
        fg: {
          DEFAULT: withVar('--fg'),
          muted: withVar('--fg-muted'),
          subtle: withVar('--fg-subtle'),
          faint: withVar('--fg-faint'),
        },

        /* Hairlines & dividers */
        line: {
          DEFAULT: withVar('--line'),
          strong: withVar('--line-strong'),
        },

        /* Brand — teal-forward */
        primary: {
          DEFAULT: withVar('--primary'),
          hover: withVar('--primary-hover'),
          fg: withVar('--primary-fg'),
        },

        /* Semantic financial states */
        success: withVar('--success'),
        warning: withVar('--warning'),
        danger: withVar('--danger'),
        info: withVar('--info'),
      },

      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['SF Mono', 'ui-monospace', 'Fira Code', 'Consolas', 'monospace'],
      },

      /* Type scale — tightened tracking on larger sizes for premium feel */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.875rem', { lineHeight: '1.35rem' }],
        base: ['1rem', { lineHeight: '1.55rem' }],
        lg: ['1.125rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
        xl: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        '2xl': ['1.75rem', { lineHeight: '2.1rem', letterSpacing: '-0.02em' }],
        '3xl': ['2.125rem', { lineHeight: '2.4rem', letterSpacing: '-0.022em' }],
        '4xl': ['2.75rem', { lineHeight: '2.9rem', letterSpacing: '-0.025em' }],
        '5xl': ['3.5rem', { lineHeight: '3.6rem', letterSpacing: '-0.03em' }],
        '6xl': ['4rem', { lineHeight: '4rem', letterSpacing: '-0.035em' }],
      },

      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },

      boxShadow: {
        xs: '0 1px 2px 0 rgb(var(--shadow) / 0.05)',
        sm: '0 1px 3px 0 rgb(var(--shadow) / 0.08), 0 1px 2px -1px rgb(var(--shadow) / 0.08)',
        card: '0 2px 8px -2px rgb(var(--shadow) / 0.10), 0 4px 16px -4px rgb(var(--shadow) / 0.08)',
        raised: '0 8px 28px -6px rgb(var(--shadow) / 0.18), 0 2px 8px -2px rgb(var(--shadow) / 0.10)',
        overlay: '0 24px 60px -12px rgb(var(--shadow) / 0.32), 0 8px 24px -8px rgb(var(--shadow) / 0.22)',
        glow: '0 8px 28px -6px rgb(var(--primary) / 0.35)',
      },

      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
