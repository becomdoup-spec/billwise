import { useState, useRef, useCallback } from 'react'
import type { BillItem, ItemSelection, User } from '../../types'
import { formatCurrency } from '../../services/calculations'
import { Check, Lock, Scale, SlidersHorizontal } from 'lucide-react'

interface PortionSliderProps {
  item: BillItem
  currentPortion: number
  /** Other participants' selections for this item (excluding current user) */
  otherSelections: ItemSelection[]
  participants: User[]
  onConfirm: (portion: number) => void
  onCancel: () => void
}

const STEP = 1
const NOTCH_EVERY = 10

function snap(value: number, max: number) {
  const stepped = Math.round(value / STEP) * STEP
  return Math.min(Math.max(0, stepped), max)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function formatPercentage(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function amountInputValue(value: number) {
  return value > 0 ? round(value).toString() : ''
}

export function PortionSlider({
  item,
  currentPortion,
  otherSelections,
  participants,
  onConfirm,
  onCancel,
}: PortionSliderProps) {
  const [shareMode, setShareMode] = useState<'equal' | 'custom'>(
    currentPortion === 100 ? 'equal' : 'custom',
  )
  const otherFixedPortions = otherSelections
    .filter((selection) => selection.portionPercentage < 100)
    .reduce((sum, selection) => sum + selection.portionPercentage, 0)
  const maxPortion = Math.max(STEP, round(100 - otherFixedPortions))
  const [portion, setPortion] = useState(() => snap(currentPortion || maxPortion, maxPortion))
  const [amountInput, setAmountInput] = useState(() => amountInputValue(item.totalPrice * (portion / 100)))
  const [animKey, setAnimKey] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const amount = item.totalPrice * (portion / 100)
  const remaining = maxPortion - portion

  const presets = [25, 33, 50, 67, 75, 100].filter((preset) => preset <= maxPortion)

  const setPortionAnimated = useCallback((v: number) => {
    const nextPortion = snap(v, maxPortion)
    setPortion(nextPortion)
    setAmountInput(amountInputValue(item.totalPrice * (nextPortion / 100)))
    setAnimKey((k) => k + 1)
  }, [item.totalPrice, maxPortion])

  const setAbsoluteAmount = (rawValue: string) => {
    setAmountInput(rawValue)
    const enteredAmount = Number(rawValue)
    if (!rawValue || !Number.isFinite(enteredAmount) || item.totalPrice <= 0) return
    const maxAmount = item.totalPrice * (maxPortion / 100)
    const boundedAmount = Math.min(Math.max(0, enteredAmount), maxAmount)
    const calculatedPortion = round((boundedAmount / item.totalPrice) * 100)
    setPortion(calculatedPortion)
    setAnimKey((key) => key + 1)
  }

  // Notch marks along the track
  const notchCount = Math.floor(maxPortion / NOTCH_EVERY)
  const notches = Array.from({ length: notchCount + 1 }, (_, i) => i * NOTCH_EVERY).filter(n => n <= maxPortion)

  // Color based on portion (theme-aware via CSS custom properties)
  const accentColor = portion === 0
    ? 'rgb(var(--fg-faint))'
    : portion <= 40
      ? 'rgb(var(--success))'
      : portion <= 70
        ? 'rgb(var(--warning))'
        : 'rgb(var(--primary))'

  return (
    <div className="anim-sheet-up space-y-5">
      {/* Item name */}
      <div className="text-center">
        <p className="text-xs text-fg-subtle truncate max-w-[220px] mx-auto">{item.name}</p>
        <p className="text-[10px] text-fg-faint mt-0.5">{formatCurrency(item.totalPrice)} total</p>
      </div>

      {/* How this selection should be shared */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1.5 border border-line">
        <button
          type="button"
          onClick={() => setShareMode('equal')}
          className={`relative rounded-lg px-3 py-3 text-left border transition-all ${
            shareMode === 'equal'
              ? 'bg-primary/15 border-primary/40 text-fg'
              : 'border-transparent text-fg-subtle hover:text-fg-muted'
          }`}
        >
          <div className="flex items-center gap-2">
            <Scale size={14} className={shareMode === 'equal' ? 'text-primary' : ''} />
            <span className="text-xs font-semibold">Split equally</span>
            {shareMode === 'equal' && <Check size={12} className="ml-auto text-primary" />}
          </div>
          <p className="text-[10px] leading-relaxed text-fg-subtle mt-1.5">
            Share equally with everyone who selects this item.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setShareMode('custom')}
          className={`relative rounded-lg px-3 py-3 text-left border transition-all ${
            shareMode === 'custom'
              ? 'bg-primary/15 border-primary/40 text-fg'
              : 'border-transparent text-fg-subtle hover:text-fg-muted'
          }`}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className={shareMode === 'custom' ? 'text-primary' : ''} />
            <span className="text-xs font-semibold">Set my portion</span>
            {shareMode === 'custom' && <Check size={12} className="ml-auto text-primary" />}
          </div>
          <p className="text-[10px] leading-relaxed text-fg-subtle mt-1.5">
            Enter the amount or percentage you consumed.
          </p>
        </button>
      </div>

      {shareMode === 'equal' ? (
        <div className="rounded-xl border border-success/20 bg-success/[0.07] px-4 py-4 text-center">
          <p className="text-sm font-semibold text-success">No percentage needed</p>
          <p className="text-xs leading-relaxed text-fg-subtle mt-1">
            Your share will adjust automatically as other people select or leave this item.
          </p>
        </div>
      ) : (
        <>
          {/* Big % display */}
          <div className="text-center">
            <div
              key={animKey}
              className="text-6xl font-bold tabular-nums anim-amount-change inline-block"
              style={{ color: accentColor }}
            >
              {formatPercentage(portion)}%
            </div>
            <p className="text-sm text-fg-muted mt-1.5">
              = <span className="text-fg font-semibold">{formatCurrency(amount)}</span>
            </p>
            {remaining > 0 && remaining < maxPortion && (
              <p className="text-xs text-fg-faint mt-1">{remaining}% unallocated</p>
            )}
          </div>

          {/* Absolute amount entry */}
          <div className="bg-surface-raised border border-line rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-fg-muted">Enter your amount</p>
                <p className="text-[10px] text-fg-faint mt-0.5">Percentage is calculated automatically</p>
              </div>
              <div className="relative w-32">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">₹</span>
                <input
                  type="number"
                  min={0}
                  max={round(item.totalPrice * (maxPortion / 100))}
                  step="0.01"
                  inputMode="decimal"
                  value={amountInput}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setAbsoluteAmount(event.target.value)}
                  onBlur={() => setAmountInput(amountInputValue(amount))}
                  className="w-full bg-surface border border-line rounded-lg pl-7 pr-2 py-2 text-sm text-fg text-right focus:outline-none focus:border-primary/60"
                  aria-label="Your absolute amount for this item"
                />
              </div>
            </div>
            <p className="text-[10px] text-fg-subtle text-right">
              {amountInput || '0'} of {formatCurrency(item.totalPrice)} = {formatPercentage(portion)}%
            </p>
          </div>
        </>
      )}

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
                className="flex items-center gap-1.5 bg-surface-raised border border-line rounded-full px-2.5 py-1"
              >
                <div className="w-4 h-4 rounded-full bg-surface-overlay flex items-center justify-center text-[9px] font-bold text-fg-muted">
                  {user.name[0]?.toUpperCase()}
                </div>
                <span className="text-xs text-fg-muted">{user.name.split(' ')[0]}</span>
                <span className="text-xs font-medium" style={{ color: accentColor }}>
                  {sel.portionPercentage === 100 ? 'Equal share' : `${sel.portionPercentage}%`}
                </span>
                {isLocked && <Lock size={9} className="text-fg-subtle" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Track + slider */}
      {shareMode === 'custom' && <div className="space-y-1 px-1">
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
                  background: n <= portion ? accentColor : 'rgb(var(--line-strong))',
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
            background: `linear-gradient(to right, ${accentColor} ${(portion / maxPortion) * 100}%, rgb(var(--surface-overlay)) ${(portion / maxPortion) * 100}%)`,
          }}
        />

        <div className="flex justify-between text-[10px] text-fg-faint mt-1">
          <span>0%</span>
          <span>{maxPortion}%</span>
        </div>
      </div>}

      {/* Presets */}
      {shareMode === 'custom' && <div>
        <p className="text-[10px] font-medium text-fg-faint uppercase tracking-wider mb-2">Quick select</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setPortionAnimated(p)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                portion === p
                  ? 'border-primary/50 text-primary font-semibold'
                  : 'bg-surface-raised border-line text-fg-subtle hover:text-fg'
              }`}
              style={portion === p ? { background: 'rgb(var(--primary) / 0.12)' } : {}}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-surface-raised border border-line rounded-xl text-sm text-fg-muted hover:text-fg transition-all active:scale-95"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(shareMode === 'equal' ? 100 : portion)}
          disabled={shareMode === 'custom' && portion === 0}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold text-primary-fg transition-all active:scale-95 disabled:bg-surface-overlay disabled:text-fg-faint"
          style={shareMode === 'equal' || portion > 0 ? { background: 'rgb(var(--primary))' } : {}}
        >
          {shareMode === 'equal' ? 'Split equally' : `Set ${formatPercentage(portion)}%`}
        </button>
      </div>
    </div>
  )
}
