import { useState, useRef, useCallback } from 'react'
import type { BillItem, ItemSelection, User } from '../../types'
import { formatCurrency } from '../../services/calculations'
import { Lock } from 'lucide-react'

interface PortionSliderProps {
  item: BillItem
  currentPortion: number
  /** Other participants' selections for this item (excluding current user) */
  otherSelections: ItemSelection[]
  participants: User[]
  onConfirm: (portion: number) => void
  onCancel: () => void
}

const STEP = 5
const NOTCH_EVERY = 10

function snap(value: number, max: number) {
  const stepped = Math.round(value / STEP) * STEP
  return Math.min(Math.max(0, stepped), max)
}

export function PortionSlider({
  item,
  currentPortion,
  otherSelections,
  participants,
  onConfirm,
  onCancel,
}: PortionSliderProps) {
  const otherPortionsTotal = otherSelections.reduce((s, x) => s + x.portionPercentage, 0)
  const maxPortion = Math.max(STEP, 100 - otherPortionsTotal + currentPortion)
  const [portion, setPortion] = useState(() => snap(currentPortion || Math.max(STEP, 100 - otherPortionsTotal), maxPortion))
  const [animKey, setAnimKey] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const amount = item.totalPrice * (portion / 100)
  const remaining = maxPortion - portion

  const presets = [25, 33, 50, 67, 75, 100].filter((p) => p <= maxPortion && p % STEP === 0 || p <= maxPortion)

  const setPortionAnimated = useCallback((v: number) => {
    setPortion(snap(v, maxPortion))
    setAnimKey((k) => k + 1)
  }, [maxPortion])

  // Notch marks along the track
  const notchCount = Math.floor(maxPortion / NOTCH_EVERY)
  const notches = Array.from({ length: notchCount + 1 }, (_, i) => i * NOTCH_EVERY).filter(n => n <= maxPortion)

  // Color based on portion
  const accentColor = portion === 0 ? '#71717a' : portion <= 40 ? '#4ade80' : portion <= 70 ? '#facc15' : '#d4956a'

  return (
    <div className="anim-sheet-up space-y-5">
      {/* Item name */}
      <div className="text-center">
        <p className="text-xs text-zinc-500 truncate max-w-[220px] mx-auto">{item.name}</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">{formatCurrency(item.totalPrice)} total</p>
      </div>

      {/* Big % display */}
      <div className="text-center">
        <div
          key={animKey}
          className="text-6xl font-bold tabular-nums anim-amount-change inline-block"
          style={{ color: accentColor }}
        >
          {portion}%
        </div>
        <p className="text-sm text-zinc-400 mt-1.5">
          = <span className="text-white font-semibold">{formatCurrency(amount)}</span>
        </p>
        {remaining > 0 && remaining < maxPortion && (
          <p className="text-xs text-zinc-600 mt-1">{remaining}% unallocated</p>
        )}
      </div>

      {/* Others who selected this item */}
      {otherSelections.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {otherSelections.map((sel) => {
            const user = participants.find((u) => u.id === sel.userId)
            if (!user) return null
            const isLocked = !!sel.lockedAt
            return (
              <div
                key={sel.userId}
                className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-full px-2.5 py-1"
              >
                <div className="w-4 h-4 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-zinc-300">
                  {user.name[0]?.toUpperCase()}
                </div>
                <span className="text-xs text-zinc-400">{user.name.split(' ')[0]}</span>
                <span className="text-xs font-medium" style={{ color: accentColor }}>{sel.portionPercentage}%</span>
                {isLocked && <Lock size={9} className="text-zinc-500" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Track + slider */}
      <div className="space-y-1 px-1">
        {/* Notch marks */}
        <div className="relative h-3 flex items-end mb-1" ref={trackRef}>
          {notches.map((n) => (
            <div
              key={n}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: `${(n / maxPortion) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <div
                className="w-px transition-colors"
                style={{
                  height: n % 25 === 0 ? '8px' : '4px',
                  background: n <= portion ? accentColor : '#3f3f46',
                  opacity: n % 25 === 0 ? 1 : 0.5,
                }}
              />
            </div>
          ))}
        </div>

        {/* Range input */}
        <input
          type="range"
          min={0}
          max={maxPortion}
          step={STEP}
          value={portion}
          onChange={(e) => setPortionAnimated(parseInt(e.target.value))}
          className="slider-brand w-full"
          style={{
            background: `linear-gradient(to right, ${accentColor} ${(portion / maxPortion) * 100}%, #27272a ${(portion / maxPortion) * 100}%)`,
          }}
        />

        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>0%</span>
          <span>{maxPortion}%</span>
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Quick select</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setPortionAnimated(p)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                portion === p
                  ? 'border-brand/50 text-brand font-semibold'
                  : 'bg-surface-2 border-border text-zinc-500 hover:text-white'
              }`}
              style={portion === p ? { background: `${accentColor}18` } : {}}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-surface-2 border border-border rounded-xl text-sm text-zinc-400 hover:text-white transition-all active:scale-95"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(portion)}
          disabled={portion === 0}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold text-surface-0 transition-all active:scale-95 disabled:bg-surface-3 disabled:text-zinc-600"
          style={portion > 0 ? { background: accentColor } : {}}
        >
          Set {portion}%
        </button>
      </div>
    </div>
  )
}
