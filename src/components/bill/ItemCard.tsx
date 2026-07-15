import {
  useRef, useCallback, useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
  lockedParticipantIds: string[]
  currentUserId: string
  isLocked: boolean
  isAdmin: boolean
  canEditBill?: boolean
  canEditSelection?: boolean
  showSelectionControl?: boolean
  isPending?: boolean
  onSelect: (itemId: string) => void
  onDeselect: (itemId: string) => void
  onPortionChange: (itemId: string, portion: number) => void
  onEditName?: (itemId: string, name: string) => void
  onEditPrice?: (itemId: string, price: number) => void
  onEditQuantity?: (itemId: string, quantity: number) => void
  onDelete?: (itemId: string) => void
}

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

const TOUCH_MOVE_TOLERANCE_PX = 18
const SYNTHETIC_CLICK_GUARD_MS = 800

// Mobile browsers can dispatch a delayed click after pointerup. Selection
// immediately changes card height, so that click can otherwise hit the next
// item. This guard is shared by every card to block cross-card ghost clicks.
let suppressSyntheticItemClickUntil = 0

function isNestedInteractiveTarget(target: EventTarget | null, card: HTMLElement) {
  return target instanceof Element
    && target !== card
    && Boolean(target.closest('button, input, select, textarea, a, [data-item-card-interactive]'))
}

export function ItemCard({
  item,
  selection,
  itemSelections,
  participants,
  lockedParticipantIds,
  currentUserId,
  isLocked,
  isAdmin,
  canEditBill = false,
  canEditSelection = true,
  showSelectionControl = true,
  isPending = false,
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
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchGesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  const isSelected = Boolean(selection)
  const selectionLocked = isLocked || !canEditSelection
  const selectionDisabled = selectionLocked
  const billEditingEnabled = canEditBill && !isLocked
  const portion = selection?.portionPercentage ?? 100
  const isSplit = portion < 100
  const myAmount = isSelected ? item.totalPrice * (portion / 100) : 0
  const allocatedPortion = getAllocatedPortion(itemSelections)
  const allocationOver = allocatedPortion > 100.01
  const equalShareSelections = itemSelections.filter((itemSelection) => itemSelection.portionPercentage === 100)
  const allParticipantsLocked = participants.length > 0
    && participants.every((participant) => lockedParticipantIds.includes(participant.id))
  const equalSplitPending = equalShareSelections.length > 0 && !allParticipantsLocked && !allocationOver
  const allocationComplete = !equalSplitPending && allocatedPortion >= 99.99 && allocatedPortion <= 100.01
  const provisionalEqualSelection = isSelected && portion === 100 && equalSplitPending
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
    if (selectionDisabled) return
    setShowSlider(true)
  }, [selectionDisabled])

  const handleClick = useCallback(() => {
    if (selectionDisabled) return
    if (isSelected) {
      triggerAnim('anim-deselect')
      onDeselect(item.id)
    } else {
      triggerAnim('anim-select')
      onSelect(item.id)
    }
  }, [selectionDisabled, isSelected, item.id, onSelect, onDeselect, triggerAnim])

  const handleCardClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // detail=0 is keyboard/assistive activation and must remain available.
    if (event.detail !== 0 && Date.now() < suppressSyntheticItemClickUntil) {
      event.preventDefault()
      return
    }
    handleClick()
  }, [handleClick])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== 'touch'
      || !event.isPrimary
      || !showSelectionControl
      || selectionDisabled
      || isNestedInteractiveTarget(event.target, event.currentTarget)
    ) return

    // Suppress the browser-generated click for this touch across all cards.
    suppressSyntheticItemClickUntil = Date.now() + SYNTHETIC_CLICK_GUARD_MS
    touchGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [selectionDisabled, showSelectionControl])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = touchGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return

    const distance = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    )
    if (distance > TOUCH_MOVE_TOLERANCE_PX) gesture.moved = true
  }, [])

  const finishTouchGesture = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = touchGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    touchGesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    // Movement means scrolling or a finger sliding across rows, never a tap.
    if (cancelled || gesture.moved) return
    event.preventDefault()
    handleClick()
  }, [handleClick])

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
        onClick={handleCardClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishTouchGesture(event)}
        onPointerCancel={(event) => finishTouchGesture(event, true)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          handleClick()
        }}
        role={showSelectionControl ? 'button' : undefined}
        tabIndex={showSelectionControl && !selectionDisabled ? 0 : undefined}
        aria-pressed={showSelectionControl ? isSelected : undefined}
        aria-disabled={showSelectionControl ? selectionDisabled : undefined}
        aria-busy={isPending || undefined}
        aria-label={showSelectionControl ? `${item.name}: ${isSelected ? 'selected' : 'not selected'}` : undefined}
        className={clsx(
          'relative flex min-h-11 touch-pan-y touch-pinch-zoom items-start gap-3 overflow-hidden px-4 py-3.5 select-none transition-[background-color,opacity,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60',
          showSelectionControl ? 'cursor-pointer' : 'cursor-default',
          'active:bg-surface-overlay/40',
          equalSplitPending
            ? 'bg-gradient-to-r from-info/[0.10] to-transparent'
            : allocationComplete
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
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-150',
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
              {billEditingEnabled && editingName ? (
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
                    billEditingEnabled && 'cursor-text hover:text-fg',
                  )}
                  onDoubleClick={billEditingEnabled ? (e) => { e.stopPropagation(); setEditingName(true) } : undefined}
                >
                  {item.name}
                  {billEditingEnabled && (
                    <span className="ml-1 opacity-0 group-hover:opacity-100 text-fg-faint text-[10px]">✎</span>
                  )}
                </p>
              )}
              {onDelete && billEditingEnabled && (
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
                {billEditingEnabled && onEditQuantity && (
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
              {billEditingEnabled && editingPrice ? (
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
                    'text-sm font-semibold transition-[color,transform] duration-150',
                    provisionalEqualSelection ? 'text-info' : isSelected ? 'text-primary' : 'text-fg-muted',
                    billEditingEnabled && 'cursor-text hover:text-primary',
                  )}
                  onDoubleClick={billEditingEnabled ? (e) => { e.stopPropagation(); setEditingPrice(true) } : undefined}
                >
                  {provisionalEqualSelection
                    ? 'Equal split'
                    : isSelected ? formatCurrency(myAmount) : formatCurrency(item.totalPrice)}
                </p>
              )}
              <p className={clsx(
                'mt-0.5 text-[10px]',
                isSelected ? selectionLocked ? 'text-success' : 'text-fg-subtle' : 'text-fg-faint',
              )}>
                {!isSelected
                  ? 'Not selected'
                  : selectionLocked
                    ? 'Locked allocation'
                    : provisionalEqualSelection ? 'Ready for equal split' : 'Selected'}
              </p>
              {!provisionalEqualSelection && isSplit && isSelected && (
                <p className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1 justify-end">
                  <Sliders size={8} />
                  {portion}% of {formatCurrency(item.totalPrice)}
                </p>
              )}
            </div>
          </div>

          {/* Item allocation status */}
          {!equalSplitPending && (
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
                    'h-full rounded-full transition-[width,background-color] duration-200 ease-out',
                    allocationComplete
                      ? 'bg-success'
                      : allocationOver ? 'bg-danger' : allocatedPortion > 0 ? 'bg-warning' : 'bg-surface-hover',
                  )}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>
          )}

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
                    {!isSplitSel && (
                      <span className="opacity-70">Equal</span>
                    )}
                    {isUserLocked && (
                      <Lock size={8} className="opacity-60" style={{ color }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {selection && (
            <div className="flex items-center gap-2">
              {selectionLocked ? (
                <span className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-success/25 bg-success/10 px-3 text-[10px] font-medium text-success">
                  <Lock size={11} /> Locked allocation
                </span>
              ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  triggerPortionSlider()
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 text-xs font-medium text-fg-muted transition-[color,border-color,background-color] duration-150 hover:border-primary/30 hover:text-primary disabled:opacity-60"
              >
                <Sliders size={12} />
                Portion
              </button>
              )}
            </div>
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
