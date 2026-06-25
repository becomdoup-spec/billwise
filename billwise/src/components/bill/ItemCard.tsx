import { useRef, useCallback, useState } from 'react'
import { Check, Sliders, Lock, CircleCheck, Clock3, TriangleAlert, Trash2 } from 'lucide-react'
import type { BillItem, ItemSelection, User } from '../../types'
import { formatCurrency, getAllocatedPortion } from '../../services/calculations'
import { Modal } from '../shared/Modal'
import { PortionSlider } from './PortionSlider'
import clsx from 'clsx'

interface ItemCardProps {
  item: BillItem
  selection?: ItemSelection
  itemSelections: ItemSelection[]  // all selections for this item (all users)
  participants: User[]             // all session participants
  currentUserId: string
  isLocked: boolean
  isAdmin: boolean
  canEditSelection?: boolean
  showSelectionControl?: boolean
  onSelect: (itemId: string) => void
  onDeselect: (itemId: string) => void
  onPortionChange: (itemId: string, portion: number) => void
  onEditName?: (itemId: string, name: string) => void
  onEditPrice?: (itemId: string, price: number) => void
  onEditQuantity?: (itemId: string, quantity: number) => void
  onDelete?: (itemId: string) => void
}

const LONG_PRESS_MS = 600

// Stable colors per user (hash-based, dark-palette friendly)
const AVATAR_COLORS = [
  '#6366f1', '#22d3ee', '#4ade80', '#f59e0b', '#ec4899',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8', '#f472b6',
]
function avatarColor(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function ItemCard({
  item,
  selection,
  itemSelections,
  participants,
  currentUserId,
  isLocked,
  isAdmin,
  canEditSelection = true,
  showSelectionControl = true,
  onSelect,
  onDeselect,
  onPortionChange,
  onEditName,
  onEditPrice,
  onEditQuantity,
  onDelete,
}: ItemCardProps) {
  const [showSlider, setShowSlider] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [nameVal, setNameVal] = useState(item.name)
  const [priceVal, setPriceVal] = useState(String(item.totalPrice))
  const [animClass, setAnimClass] = useState<string>('')
  const [lastClickTime, setLastClickTime] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSelected = Boolean(selection)
  const selectionLocked = isLocked || !canEditSelection
  const portion = selection?.portionPercentage ?? 100
  const isSplit = portion < 100
  const myAmount = isSelected ? item.totalPrice * (portion / 100) : 0
  const allocatedPortion = getAllocatedPortion(itemSelections)
  const allocationComplete = allocatedPortion >= 99.99 && allocatedPortion <= 100.01
  const allocationOver = allocatedPortion > 100.01
  const displayAllocated = allocationComplete ? 100 : allocatedPortion
  const pendingPortion = Math.max(0, Math.round((100 - allocatedPortion) * 100) / 100)
  const progressWidth = Math.min(100, Math.max(0, allocatedPortion))

  const otherSelections = itemSelections.filter((s) => s.userId !== currentUserId)

  const triggerAnim = useCallback((cls: string) => {
    setAnimClass(cls)
    if (animTimer.current) clearTimeout(animTimer.current)
    animTimer.current = setTimeout(() => setAnimClass(''), 400)
  }, [])

  const triggerPortionSlider = useCallback(() => {
    if (selectionLocked) return
    if (!isSelected) onSelect(item.id)
    triggerAnim('anim-secret-ripple')
    setTimeout(() => setShowSlider(true), 120)
  }, [selectionLocked, isSelected, item.id, onSelect, triggerAnim])

  // Long press
  const handlePointerDown = useCallback(() => {
    if (selectionLocked) return
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressTriggered.current = true
      triggerPortionSlider()
    }, LONG_PRESS_MS)
  }, [selectionLocked, triggerPortionSlider])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }, [])

  // Double-click on selected → portion slider; single click → toggle select
  const handleClick = useCallback(() => {
    if (selectionLocked) return
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    const now = Date.now()
    const sinceLastClick = now - lastClickTime
    setLastClickTime(now)

    if (sinceLastClick < 350 && isSelected) {
      // Double-click on selected item → open slider
      cancelLongPress()
      triggerPortionSlider()
      return
    }

    // Single click — toggle
    if (isSelected) {
      triggerAnim('anim-deselect')
      onDeselect(item.id)
    } else {
      triggerAnim('anim-select')
      onSelect(item.id)
    }
  }, [selectionLocked, lastClickTime, isSelected, item.id, onSelect, onDeselect, triggerPortionSlider, cancelLongPress, triggerAnim])

  const commitName = () => {
    setEditingName(false)
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== item.name) onEditName?.(item.id, trimmed)
    else setNameVal(item.name)
  }

  const commitPrice = () => {
    setEditingPrice(false)
    const val = parseFloat(priceVal)
    if (!isNaN(val) && val > 0 && val !== item.totalPrice) onEditPrice?.(item.id, val)
    else setPriceVal(String(item.totalPrice))
  }

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onClick={handleClick}
        className={clsx(
          'relative flex items-start gap-3 px-4 py-3.5 select-none overflow-hidden transition-all duration-500',
          showSelectionControl ? 'cursor-pointer' : 'cursor-default',
          'active:bg-surface-overlay/40',
          allocationComplete
            ? 'bg-gradient-to-r from-success/[0.13] via-success/[0.04] to-transparent anim-allocation-complete'
            : allocationOver
              ? 'bg-gradient-to-r from-danger/[0.12] to-transparent'
              : allocatedPortion > 0
                ? 'bg-gradient-to-r from-warning/[0.08] to-transparent'
                : isSelected ? 'bg-primary/5' : 'bg-transparent',
          selectionLocked && !isAdmin && 'opacity-75',
          animClass,
        )}
      >
        {/* Checkbox */}
        {showSelectionControl && (
          <div className={clsx(
            'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200',
            isSelected ? 'bg-primary border-primary scale-110' : 'border-line-strong bg-transparent scale-100',
          )}>
            {isSelected && <Check size={11} strokeWidth={3} className="text-primary-fg" />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name + price row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {isAdmin && editingName ? (
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(item.name); setEditingName(false) } }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-surface-overlay border border-primary/40 rounded-lg px-2 py-0.5 text-sm text-fg outline-none"
                />
              ) : (
                <p
                  className={clsx(
                    'text-sm font-medium truncate',
                    isSelected ? 'text-fg' : 'text-fg-muted',
                    isAdmin && !isLocked && 'cursor-text hover:text-fg',
                  )}
                  onDoubleClick={isAdmin && !isLocked ? (e) => { e.stopPropagation(); setEditingName(true) } : undefined}
                >
                  {item.name}
                  {isAdmin && !isLocked && (
                    <span className="ml-1 opacity-0 group-hover:opacity-100 text-fg-faint text-[10px]">✎</span>
                  )}
                </p>
              )}
              {onDelete && !isLocked && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                  className="mt-0.5 flex items-center gap-0.5 text-[10px] text-fg-faint hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove item"
                >
                  <Trash2 size={10} />
                </button>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-fg-faint">
                  {item.quantity > 1
                    ? `${item.quantity} × ${formatCurrency(item.unitPrice)}`
                    : formatCurrency(item.unitPrice)}
                </p>
                {isAdmin && !isLocked && onEditQuantity && (
                  <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onEditQuantity(item.id, Math.max(1, item.quantity - 1))}
                      className="w-5 h-5 rounded border border-line text-[11px] text-fg-subtle hover:text-fg"
                      aria-label={`Decrease ${item.name} quantity`}
                    >−</button>
                    <span className="text-[10px] text-fg-subtle">Qty {item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onEditQuantity(item.id, item.quantity + 1)}
                      className="w-5 h-5 rounded border border-line text-[11px] text-fg-subtle hover:text-fg"
                      aria-label={`Increase ${item.name} quantity`}
                    >+</button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              {isAdmin && editingPrice ? (
                <input
                  autoFocus
                  value={priceVal}
                  onChange={(e) => setPriceVal(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(); if (e.key === 'Escape') { setPriceVal(String(item.totalPrice)); setEditingPrice(false) } }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 bg-surface-overlay border border-primary/40 rounded-lg px-2 py-0.5 text-sm text-fg outline-none text-right"
                  inputMode="decimal"
                />
              ) : (
                <p
                  className={clsx(
                    'text-sm font-semibold transition-all',
                    isSelected ? 'text-primary' : 'text-fg-muted',
                    isAdmin && !isLocked && 'cursor-text hover:text-primary',
                  )}
                  onDoubleClick={isAdmin && !isLocked ? (e) => { e.stopPropagation(); setEditingPrice(true) } : undefined}
                >
                  {isSelected ? formatCurrency(myAmount) : formatCurrency(item.totalPrice)}
                </p>
              )}
              {isSplit && isSelected && (
                <p className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1 justify-end">
                  <Sliders size={8} />
                  {portion}% of {formatCurrency(item.totalPrice)}
                </p>
              )}
            </div>
          </div>

          {/* Item allocation status */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] font-medium">
              <span className={clsx(
                'flex items-center gap-1',
                allocationComplete
                  ? 'text-success'
                  : allocationOver
                    ? 'text-danger'
                    : allocatedPortion > 0 ? 'text-warning' : 'text-fg-faint',
              )}>
                {allocationComplete
                  ? <CircleCheck size={11} />
                  : allocationOver
                    ? <TriangleAlert size={11} />
                    : <Clock3 size={11} />}
                {allocationComplete
                  ? '100% allocated · Complete'
                  : allocationOver
                    ? `${displayAllocated}% allocated · ${Math.round((allocatedPortion - 100) * 100) / 100}% over`
                    : `${displayAllocated}% allocated · ${pendingPortion}% pending`}
              </span>
              {!allocationComplete && !allocationOver && allocatedPortion > 0 && (
                <span className="text-fg-faint">{formatCurrency(item.totalPrice * pendingPortion / 100)} left</span>
              )}
            </div>
            <div className="h-1 rounded-full bg-surface-overlay/80 overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-700 ease-out',
                  allocationComplete
                    ? 'bg-success'
                    : allocationOver ? 'bg-danger' : allocatedPortion > 0 ? 'bg-warning' : 'bg-surface-hover',
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
          </div>

          {/* Participant avatars row */}
          {itemSelections.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {itemSelections.map((sel, idx) => {
                const user = participants.find((u) => u.id === sel.userId)
                if (!user) return null
                const isMe = sel.userId === currentUserId
                const isUserLocked = !!sel.lockedAt
                const color = avatarColor(user.id)
                const isSplitSel = sel.portionPercentage < 100

                return (
                  <div
                    key={sel.userId}
                    className="flex items-center gap-1 rounded-full border text-[10px] px-2 py-0.5 anim-avatar-in"
                    style={{
                      animationDelay: `${idx * 40}ms`,
                      background: `${color}14`,
                      borderColor: `${color}35`,
                      color,
                    }}
                  >
                    {/* Mini avatar */}
                    <div
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-fg shrink-0"
                      style={{ background: color }}
                    >
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium max-w-[48px] truncate" style={{ color }}>
                      {isMe ? 'You' : user.name.split(' ')[0]}
                    </span>
                    {isSplitSel && (
                      <span className="opacity-70">{sel.portionPercentage}%</span>
                    )}
                    {isUserLocked && (
                      <Lock size={8} className="opacity-60" style={{ color }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Hint when selected and not locked */}
          {selection && !selectionLocked && (
            <p className="text-[10px] text-fg-faint leading-none">
              hold or double-tap to adjust portion
            </p>
          )}
        </div>
      </div>

      {/* Portion slider modal */}
      <Modal
        open={showSlider}
        onClose={() => setShowSlider(false)}
        title="Share this item"
        size="sm"
      >
        <PortionSlider
          item={item}
          currentPortion={portion}
          otherSelections={otherSelections}
          participants={participants}
          onConfirm={(p) => {
            onPortionChange(item.id, p)
            setShowSlider(false)
          }}
          onCancel={() => setShowSlider(false)}
        />
      </Modal>
    </>
  )
}
