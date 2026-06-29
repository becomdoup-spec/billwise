import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  className?: string
}

export function Layout({ children, className = '' }: LayoutProps) {
  return (
    <div
      className={`h-[100dvh] min-h-[100svh] overflow-hidden text-fg font-sans ${className}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
