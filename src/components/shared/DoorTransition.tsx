import { create } from 'zustand'
import { ReceiptText } from 'lucide-react'

/**
 * Full-screen "door" transition: two panels close over the screen, the app
 * navigates underneath, then the doors part to reveal the destination.
 * Used for signature moments (unlock → dashboard, joining a group).
 */

type Phase = 'cover' | 'hold' | 'open'

interface DoorState {
  active: boolean
  phase: Phase
  token: number
}

const useDoorStore = create<DoorState>(() => ({ active: false, phase: 'cover', token: 0 }))

const COVER_MS = 280
const HOLD_MS = 150
const OPEN_MS = 620

export function playDoorTransition(onCovered: () => void) {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || useDoorStore.getState().active) {
    onCovered()
    return
  }

  const token = Date.now()
  useDoorStore.setState({ active: true, phase: 'cover', token })

  window.setTimeout(() => {
    if (useDoorStore.getState().token !== token) return
    onCovered()
    useDoorStore.setState({ phase: 'hold' })
    window.setTimeout(() => {
      if (useDoorStore.getState().token !== token) return
      useDoorStore.setState({ phase: 'open' })
      window.setTimeout(() => {
        if (useDoorStore.getState().token !== token) return
        useDoorStore.setState({ active: false })
      }, OPEN_MS)
    }, HOLD_MS)
  }, COVER_MS)
}

export function DoorTransitionOverlay() {
  const { active, phase } = useDoorStore()
  if (!active) return null

  return (
    <div className="door-overlay" data-phase={phase} aria-hidden="true">
      <div className="door-panel door-panel--left" />
      <div className="door-panel door-panel--right" />
      <div className="door-seal">
        <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.375rem] bg-primary text-primary-fg shadow-glow">
          <ReceiptText size={34} strokeWidth={2.2} />
        </div>
      </div>
    </div>
  )
}
