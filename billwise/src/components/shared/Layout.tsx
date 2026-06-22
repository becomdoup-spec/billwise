import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  className?: string
}

export function Layout({ children, className = '' }: LayoutProps) {
  return (
    <div className={`min-h-screen text-fg font-sans ${className}`}>
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  )
}
