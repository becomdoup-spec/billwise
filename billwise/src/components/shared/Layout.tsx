import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  className?: string
}

export function Layout({ children, className = '' }: LayoutProps) {
  return (
    <div
      className={`min-h-dvh text-fg font-sans ${className}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-2xl mx-auto min-h-dvh flex flex-col">
        {children}
      </div>
    </div>
  )
}
