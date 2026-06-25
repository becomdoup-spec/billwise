import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionSync } from '../hooks/useSessionSync'
import {
  Users, Receipt, BarChart3, Lock, UserPlus, UserMinus, Plus,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp, Clock, Sparkles, FileImage, Loader2, Pencil,
  ImageDown, FileDown,
} from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { ItemCard } from '../components/bill/ItemCard'
import { useAppStore } from '../store/appStore'
import {
  computeSplits, getItemPortionCoverage, formatCurrency,
  getFixedBillTotal, isBillSummaryItemName,
} from '../services/calculations'
import { toast } from '../components/shared/Toast'
import { Modal } from '../components/shared/Modal'
import { dbGetBillImageUrl } from '../lib/db'
import { downloadSplitImage, downloadSplitPdf } from '../services/splitExport'
import clsx from 'clsx'

type Tab = 'items' | 'split' | 'people'

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    sessions, users, billItems, currentUser,
    selections, setSelection, removeSelection,
    lockUserSelections, unlockUserSelections,
    addParticipant, removeParticipant,
    updateSession, updateBillItem, addBillItem, removeBillItem,
  } = useAppStore()

  const [tab, setTab] = useState<Tab>('items')
  const [expandCoverage, setExpandCoverage] = useState(false)
  const [showBillImage, setShowBillImage] = useState(false)
  const [billImageSrc, setBillImageSrc] = useState('')
  const [billImageLoading, setBillImageLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [exporting, setExporting] = useState<'image' | 'pdf' | ''>('')
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')

  useSessionSync(id)

  const session = sessions.find((s) => s.id === id)
  const isAdmin = currentUser?.role === 'admin'
  const isCreator = !isAdmin && session?.createdBy === currentUser?.id

  if (!session) return (
    <Layout>
      <Header title="Session not found" back />
      <div className="flex-1 flex items-center justify-center p-8 text-fg-subtle text-sm">
        This session does not exist.
      </div>
    </Layout>
  )

  const isSessionLocked = session.status === 'completed'
  const items = billItems[session.id] ?? []
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const sessionSelections = selections.filter((s) => s.sessionId === session.id)

  const viewingUserId = currentUser?.id ?? ''
  const selectionUserId = isAdmin && editingUserId ? editingUserId : viewingUserId
  const editingUser = participants.find((participant) => participant.id === editingUserId)
  const mySelections = sessionSelections.filter((s) => s.userId === viewingUserId)
  const activeSelections = sessionSelections.filter((s) => s.userId === selectionUserId)
  const myLocked = (session.lockedParticipantIds ?? []).includes(viewingUserId)
  const selectableItems = items.filter((item) => !isBillSummaryItemName(item.name))
  const visibleItems = selectableItems
  const fixedBillTotal = getFixedBillTotal(items, session.totalAmount) ?? session.totalAmount
  const menuSubtotal = selectableItems.reduce((sum, item) => sum + item.totalPrice, 0)
  const sharedChargesTotal = Math.max(0, fixedBillTotal - menuSubtotal)
  const sharedChargesPerPerson = sharedChargesTotal / Math.max(participants.length, 1)

  const splits = computeSplits(
    items,
    sessionSelections,
    participants,
    session.cgst,
    session.sgst,
    session.lockedParticipantIds,
    session.totalAmount,
  )
  const coverage = getItemPortionCoverage(selectableItems, sessionSelections)
  const nonParticipants = users.filter((u) => u.role === 'user' && !session.participantIds.includes(u.id))

  // All-locked state — triggers final split reveal
  const lockStatus = participants.map((p) => {
    const pSels = sessionSelections.filter((s) => s.userId === p.id)
    return { user: p, locked: (session.lockedParticipantIds ?? []).includes(p.id), count: pSels.length }
  })
  const allParticipantsLocked = participants.length > 0 && lockStatus.every((x) => x.locked)
  const hasBillImage = Boolean(session.billImageBase64 || session.billImageUrl)

  const handleViewBillImage = async () => {
    setShowBillImage(true)
    if (billImageSrc) return
    if (session.billImageBase64) {
      setBillImageSrc(
        session.billImageBase64.startsWith('data:')
          ? session.billImageBase64
          : `data:image/jpeg;base64,${session.billImageBase64}`,
      )
      return
    }
    if (!session.billImageUrl) return
    setBillImageLoading(true)
    const signedUrl = await dbGetBillImageUrl(session.billImageUrl)
    setBillImageLoading(false)
    if (signedUrl) setBillImageSrc(signedUrl)
    else toast.error('The original bill image is unavailable')
  }

  const handleSelect = async (itemId: string) => {
    if (!selectionUserId || (!isAdmin && isSessionLocked)) return
    try {
      await setSelection(session.id, selectionUserId, itemId, 100)
    } catch {
      toast.error('Selection could not be saved')
    }
  }

  const handleDeselect = async (itemId: string) => {
    if (!selectionUserId || (!isAdmin && (isSessionLocked || myLocked))) return
    try {
      await removeSelection(session.id, selectionUserId, itemId)
    } catch {
      toast.error('Selection could not be removed')
    }
  }

  const handlePortion = async (itemId: string, portion: number) => {
    if (!selectionUserId || (!isAdmin && (isSessionLocked || myLocked))) return
    try {
      await setSelection(session.id, selectionUserId, itemId, portion)
    } catch {
      toast.error('Portion could not be saved')
    }
  }

  const handleLockMine = async () => {
    try {
      await lockUserSelections(session.id, viewingUserId)
      toast.success('Your selections are locked!')
    } catch {
      toast.error('Selections could not be locked')
    }
  }

  const handleUnlockMine = async () => {
    try {
      await unlockUserSelections(session.id, viewingUserId)
      toast.info('Selections unlocked — you can edit again')
    } catch {
      toast.error('Selections could not be unlocked')
    }
  }

  const lockedCount = participants.filter((p) =>
    (session.lockedParticipantIds ?? []).includes(p.id),
  ).length

  const exportImage = async () => {
    setExporting('image')
    try {
      await downloadSplitImage(session, splits)
      toast.success('Final split image downloaded')
    } catch {
      toast.error('Final split image could not be created')
    } finally {
      setExporting('')
    }
  }

  const exportPdf = async () => {
    setExporting('pdf')
    try {
      await downloadSplitPdf(session, splits)
      toast.success('Final split PDF downloaded')
    } catch {
      toast.error('Final split PDF could not be created')
    } finally {
      setExporting('')
    }
  }

  return (
    <Layout>
      <Header
        title={session.restaurantName || 'Unnamed Bill'}
        subtitle={`#${session.orderId} · ${session.date}`}
        back
        rightAction={
          isAdmin ? (
            <button
              onClick={() => {
                if (session.status === 'locked') {
                  updateSession(session.id, { status: 'active' })
                }
                navigate('/admin')
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border bg-primary/15 border-primary/30 text-primary hover:bg-primary/25 transition-all"
            >
              <CheckCircle size={12} /> Done
            </button>
          ) : undefined
        }
      />

      {/* Bill summary bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-line">
        <div className="flex-1">
          <p className="text-xs text-fg-subtle">Invoice total</p>
          <p className="text-base font-bold text-primary">{formatCurrency(fixedBillTotal)}</p>
          {!isAdmin && (
            <p className="text-[10px] text-fg-faint mt-0.5">
              {mySelections.length} item{mySelections.length !== 1 ? 's' : ''} {myLocked ? 'locked' : 'selected'}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-fg-subtle">{participants.length} people · {selectableItems.length} items</p>
          <p className="text-xs text-fg-subtle mt-0.5">
            {lockedCount}/{participants.length} done
          </p>
          {!isAdmin && myLocked && !isSessionLocked && (
            <button
              onClick={handleUnlockMine}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Lock size={11} /> Unlock selections
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line px-4 gap-1">
        {([
          { id: 'items', label: 'Items', icon: Receipt },
          { id: 'split', label: 'Split', icon: BarChart3 },
          { id: 'people', label: 'People', icon: Users },
        ] as const).map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              tab === tid
                ? 'text-primary border-primary'
                : 'text-fg-subtle border-transparent hover:text-fg-muted',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Items tab */}
        {tab === 'items' && (
          <div className="pb-32">
            {/* Coverage warning */}
            {isAdmin && selectableItems.some((item) => {
              const cov = coverage[item.id] ?? 0
              return cov > 100.01 || (cov < 99.99 && cov > 0)
            }) && (
              <div className="mx-4 mt-3">
                <button
                  onClick={() => setExpandCoverage((v) => !v)}
                  className="w-full flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl px-4 py-2.5"
                >
                  <AlertCircle size={14} className="text-warning shrink-0" />
                  <span className="text-xs text-warning flex-1 text-left">Some items have portion coverage issues</span>
                  {expandCoverage ? <ChevronUp size={14} className="text-warning" /> : <ChevronDown size={14} className="text-warning" />}
                </button>
                {expandCoverage && (
                  <div className="mt-2 space-y-1">
                    {selectableItems.map((item) => {
                      const cov = coverage[item.id] ?? 0
                      if (cov === 0 || (cov >= 99.99 && cov <= 100.01)) return null
                      return (
                        <div key={item.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 text-xs">
                          <span className="text-fg-muted truncate flex-1">{item.name}</span>
                          <span className={clsx('ml-2 font-medium', cov > 100.01 ? 'text-danger' : 'text-warning')}>
                            {cov}% claimed
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Items list */}
            {isAdmin && (
              <div className={clsx(
                'mx-4 mt-3 rounded-xl border px-4 py-3 flex items-center gap-3',
                editingUser
                  ? 'bg-primary/10 border-primary/30'
                  : 'bg-surface border-line',
              )}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-fg">
                    {editingUser ? `Editing ${editingUser.name}'s selections` : 'Member selection editor'}
                  </p>
                  <p className="text-[10px] text-fg-subtle mt-0.5">
                    {editingUser
                      ? `${activeSelections.length} selected · changes save instantly`
                      : 'All menu items below are shared automatically with the selected participants.'}
                  </p>
                </div>
                {editingUser && (
                  <button
                    onClick={() => { setEditingUserId(''); setTab('people') }}
                    className="text-xs text-primary hover:text-primary-hover transition-colors"
                  >
                    Done editing
                  </button>
                )}
              </div>
            )}
            <div className="mt-3 bg-surface border-y border-line divide-y divide-line animate-list">
              {visibleItems.map((item) => {
                const mySelection = sessionSelections.find(
                  (s) => s.itemId === item.id && s.userId === selectionUserId,
                )

                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selection={mySelection}
                    itemSelections={sessionSelections.filter((s) => s.itemId === item.id)}
                    participants={participants}
                    currentUserId={selectionUserId}
                    isLocked={!isAdmin && (isSessionLocked || myLocked)}
                    isAdmin={isAdmin || isCreator}
                    canEditSelection={!isAdmin || Boolean(editingUser)}
                    showSelectionControl={!isAdmin || Boolean(editingUser)}
                    onSelect={handleSelect}
                    onDeselect={handleDeselect}
                    onPortionChange={handlePortion}
                    onEditName={(itemId, name) => {
                      updateBillItem(session.id, itemId, { name }).catch(() => {
                        toast.error('Item name could not be saved')
                      })
                    }}
                    onEditPrice={(itemId, totalPrice) => {
                      const it = items.find((i) => i.id === itemId)
                      if (!it) return
                      const unitPrice = it.quantity > 1 ? totalPrice / it.quantity : totalPrice
                      updateBillItem(session.id, itemId, {
                        totalPrice,
                        unitPrice: Math.round(unitPrice * 100) / 100,
                      }).catch(() => {
                        toast.error('Item price could not be saved')
                      })
                    }}
                    onEditQuantity={(itemId, quantity) => {
                      const item = items.find((candidate) => candidate.id === itemId)
                      if (!item) return
                      const totalPrice = Math.round(quantity * item.unitPrice * 100) / 100
                      updateBillItem(session.id, itemId, { quantity, totalPrice }).catch(() => {
                        toast.error('Quantity could not be saved')
                      })
                    }}
                    onDelete={isCreator ? (itemId) => {
                      removeBillItem(session.id, itemId).catch(() => {
                        toast.error('Item could not be removed')
                      })
                    } : undefined}
                  />
                )
              })}

              {visibleItems.length === 0 && (
                <div className="py-12 text-center">
                  <Receipt size={24} className="text-fg-faint mx-auto mb-2" />
                  <p className="text-xs text-fg-subtle">
                    No items on this bill
                  </p>
                </div>
              )}
            </div>

            {/* Add item — creator only */}
            {isCreator && (
              <div className="mx-4 mt-3">
                {addingItem ? (
                  <div className="bg-surface border border-primary/30 rounded-xl p-3 space-y-2">
                    <input
                      autoFocus
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Item name"
                      className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/50"
                    />
                    <input
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="Price (₹)"
                      inputMode="decimal"
                      className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAddingItem(false); setNewItemName(''); setNewItemPrice('') }}
                        className="flex-1 py-2 rounded-lg border border-line text-xs text-fg-muted hover:bg-surface-overlay transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          const price = parseFloat(newItemPrice)
                          if (!newItemName.trim() || isNaN(price) || price <= 0) {
                            toast.error('Enter a valid name and price')
                            return
                          }
                          try {
                            await addBillItem(session.id, {
                              name: newItemName.trim(),
                              quantity: 1,
                              unitPrice: price,
                              totalPrice: price,
                            })
                            setNewItemName(''); setNewItemPrice('')
                            toast.success('Item added')
                          } catch {
                            toast.error('Item could not be added')
                          }
                        }}
                        className="flex-1 py-2 rounded-lg bg-primary text-xs font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
                      >
                        Add item
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingItem(true)}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-primary/40 hover:border-primary/70 bg-primary/5 hover:bg-primary/10 rounded-xl py-2.5 text-xs font-medium text-primary transition-all"
                  >
                    <Plus size={13} /> Add item to bill
                  </button>
                )}
              </div>
            )}

            {sharedChargesTotal > 0 && (
              <div className="mx-4 mt-3 flex items-start gap-2 bg-surface border border-line rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="text-xs text-fg-subtle font-medium">Shared bill charges</p>
                  <p className="text-xs text-fg-faint mt-0.5">
                    Staff contribution, tax, and rounding ({formatCurrency(sharedChargesTotal)}) are split equally among {participants.length} people = {formatCurrency(sharedChargesPerPerson)} each
                  </p>
                </div>
              </div>
            )}

            {!isAdmin && hasBillImage && (
              <button
                onClick={handleViewBillImage}
                className="mx-4 mt-3 w-[calc(100%_-_2rem)] flex items-center justify-center gap-2 bg-surface border border-line hover:border-primary/30 rounded-xl px-4 py-3 text-xs font-medium text-fg-muted hover:text-fg transition-all"
              >
                <FileImage size={14} className="text-primary" /> View original bill
              </button>
            )}
          </div>
        )}

        {/* Split tab */}
        {tab === 'split' && (
          <div className="p-4 space-y-4">
            {/* Live lock status */}
            <div className="bg-surface border border-line rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Who's locked in</p>
                {allParticipantsLocked && (
                  <span className="text-[10px] text-success font-semibold flex items-center gap-1">
                    <CheckCircle size={10} /> All done
                  </span>
                )}
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {lockStatus.map(({ user, locked }) => (
                  <div
                    key={user.id}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                      locked
                        ? 'bg-success/10 border-success/25 text-success'
                        : 'bg-warning/10 border-warning/25 text-warning',
                    )}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                      locked ? 'bg-success/30 text-success' : 'bg-warning/20 text-warning',
                    )}>
                      {user.name[0]?.toUpperCase()}
                    </div>
                    {user.id === viewingUserId ? 'You' : user.name.split(' ')[0]}
                    <span className="opacity-70">· {locked ? 'Done' : 'Pending'}</span>
                    {locked
                      ? <Lock size={9} />
                      : <Clock size={9} className="opacity-50" />}
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-xs text-fg-faint py-1">No participants yet</p>
                )}
              </div>
            </div>

            {/* Final split — only when everyone locked */}
            {allParticipantsLocked ? (
              <div className="animate-fade-in space-y-3 animate-list">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    <p className="text-sm font-semibold text-fg">Final Split</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={exportImage}
                      disabled={Boolean(exporting)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-surface text-[11px] text-fg-muted hover:text-fg hover:border-primary/30 disabled:opacity-50 transition-all"
                    >
                      {exporting === 'image'
                        ? <Loader2 size={11} className="animate-spin" />
                        : <ImageDown size={11} />}
                      Image
                    </button>
                    <button
                      onClick={exportPdf}
                      disabled={Boolean(exporting)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-surface text-[11px] text-fg-muted hover:text-fg hover:border-primary/30 disabled:opacity-50 transition-all"
                    >
                      {exporting === 'pdf'
                        ? <Loader2 size={11} className="animate-spin" />
                        : <FileDown size={11} />}
                      PDF
                    </button>
                  </div>
                </div>
                {splits.map((s) => {
                  const isMe = s.userId === viewingUserId
                  return (
                    <div
                      key={s.userId}
                      className={clsx(
                        'rounded-2xl border p-4 space-y-2 transition-all',
                        isMe
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-surface border-line',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
                            isMe ? 'bg-primary/25 text-primary' : 'bg-surface-overlay text-fg-muted',
                          )}>
                            {s.userName[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-fg">
                            {isMe ? `You (${s.userName})` : s.userName}
                          </span>
                        </div>
                        <span className={clsx('text-lg font-bold', isMe ? 'text-primary' : 'text-fg')}>
                          {formatCurrency(s.grandTotal)}
                        </span>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-line/50">
                        {s.itemBreakdown.map(({ item, portionPercentage, amount }) => (
                          <div key={item.id} className="flex justify-between text-xs text-fg-muted">
                            <span className="truncate flex-1">
                              {item.name}
                              {portionPercentage < 100 && (
                                <span className="text-fg-faint ml-1">({portionPercentage}%)</span>
                              )}
                            </span>
                            <span className="shrink-0 ml-2">{formatCurrency(amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-fg-subtle pt-1">
                          <span>Shared bill charges</span>
                          <span>{formatCurrency(s.cgstShare + s.sgstShare + s.additionalChargesShare)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-surface border border-line rounded-2xl">
                <Clock size={20} className="text-fg-faint mx-auto mb-2" />
                <p className="text-sm font-medium text-fg-muted">Waiting for everyone to lock</p>
                <p className="text-xs text-fg-faint mt-1">
                  {lockStatus.filter(x => x.locked).length}/{participants.length} locked in
                </p>
              </div>
            )}
          </div>
        )}

        {/* People tab */}
        {tab === 'people' && (
          <div className="p-4 space-y-3 animate-list">
            <p className="text-xs font-medium text-fg-subtle uppercase tracking-wider">Participants ({participants.length})</p>
            {participants.map((user) => {
              const userSels = sessionSelections.filter((s) => s.userId === user.id)
              const isUserLocked = (session.lockedParticipantIds ?? []).includes(user.id)
              const userSplit = splits.find((s) => s.userId === user.id)

              return (
                <div key={user.id} className="flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-overlay flex items-center justify-center text-sm font-bold text-fg-muted shrink-0">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-fg truncate">{user.name}</p>
                      <span className={clsx(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                        isUserLocked
                          ? 'bg-success/10 border-success/25 text-success'
                          : 'bg-warning/10 border-warning/25 text-warning',
                      )}>
                        {isUserLocked ? 'Done' : 'Pending'}
                      </span>
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {userSels.length} item{userSels.length !== 1 ? 's' : ''} selected
                      {isUserLocked ? ' · locked' : ''}
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => { setEditingUserId(user.id); setTab('items') }}
                        className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors"
                      >
                        <Pencil size={10} /> View / edit selections
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    {isAdmin && (
                      <p className="text-sm font-bold text-primary">
                        {formatCurrency(userSplit?.grandTotal ?? 0)}
                      </p>
                    )}
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          try {
                            if (isUserLocked) {
                              await unlockUserSelections(session.id, user.id)
                              toast.info(`${user.name} unlocked`)
                            } else {
                              await lockUserSelections(session.id, user.id)
                              toast.success(`${user.name} locked`)
                            }
                          } catch {
                            toast.error(`${user.name}'s status could not be saved`)
                          }
                        }}
                        className={clsx(
                          'text-xs mt-1 transition-colors',
                          isUserLocked
                            ? 'text-success hover:text-success'
                            : 'text-warning hover:text-warning',
                        )}
                      >
                        {isUserLocked ? 'Mark pending' : 'Mark done'}
                      </button>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        try {
                          await removeParticipant(session.id, user.id)
                          toast.info(`${user.name} removed`)
                        } catch {
                          toast.error(`${user.name} could not be removed`)
                        }
                      }}
                      className="p-1.5 text-fg-faint hover:text-danger transition-colors"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              )
            })}

            {(isAdmin || isCreator) && nonParticipants.length > 0 && (
              <div>
                <p className="text-xs font-medium text-fg-faint uppercase tracking-wider mb-2 mt-4">Add to session</p>
                {nonParticipants.map((user) => (
                  <button
                    key={user.id}
                    onClick={async () => {
                      try {
                        await addParticipant(session.id, user.id)
                        toast.success(`${user.name} added`)
                      } catch {
                        toast.error(`${user.name} could not be added`)
                      }
                    }}
                    className="w-full flex items-center gap-3 bg-surface border border-line border-dashed hover:border-primary/30 rounded-xl px-4 py-3 mb-2 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-xs font-bold text-fg-subtle">
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm text-fg-subtle flex-1 text-left">{user.name}</span>
                    <UserPlus size={14} className="text-fg-faint" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!isAdmin && !isSessionLocked && tab === 'items' && !myLocked && (
        <div className="border-t border-line bg-canvas/95 backdrop-blur-sm px-4 py-3 pb-safe">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <span>{mySelections.length} item{mySelections.length !== 1 ? 's' : ''} selected</span>
              <span>Review before locking</span>
            </div>
            <button
              onClick={handleLockMine}
              className="w-full py-3 bg-primary hover:bg-primary-hover btn-sheen shadow-glow disabled:shadow-none rounded-xl text-sm font-semibold text-primary-fg transition-all active:scale-98"
            >
              Lock My Selections
            </button>
          </div>
        </div>
      )}

      {/* My total bar when on split tab */}
      {tab === 'split' && !isAdmin && allParticipantsLocked && (
        <div className="border-t border-line bg-canvas/95 backdrop-blur-sm px-4 py-4 pb-safe">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Your total</span>
            <span key={splits.find((s) => s.userId === viewingUserId)?.grandTotal} className="text-xl font-bold text-primary animate-pop">
              {formatCurrency(splits.find((s) => s.userId === viewingUserId)?.grandTotal ?? 0)}
            </span>
          </div>
        </div>
      )}

      <Modal open={showBillImage} onClose={() => setShowBillImage(false)} title="Original bill" size="lg">
        {billImageLoading ? (
          <div className="h-72 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : billImageSrc ? (
          <img
            src={billImageSrc}
            alt={`Original bill from ${session.restaurantName || 'restaurant'}`}
            className="w-full max-h-[70vh] object-contain rounded-xl bg-white"
          />
        ) : (
          <p className="py-12 text-center text-sm text-fg-subtle">Bill image unavailable</p>
        )}
      </Modal>
    </Layout>
  )
}
