import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionSync } from '../hooks/useSessionSync'
import {
  Users, Receipt, BarChart3, Lock, UserPlus, UserMinus,
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
    updateSession, updateBillItem,
  } = useAppStore()

  const [tab, setTab] = useState<Tab>('items')
  const [expandCoverage, setExpandCoverage] = useState(false)
  const [showBillImage, setShowBillImage] = useState(false)
  const [billImageSrc, setBillImageSrc] = useState('')
  const [billImageLoading, setBillImageLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [exporting, setExporting] = useState<'image' | 'pdf' | ''>('')

  useSessionSync(id)

  const session = sessions.find((s) => s.id === id)
  const isAdmin = currentUser?.role === 'admin'

  if (!session) return (
    <Layout>
      <Header title="Session not found" back />
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-sm">
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
  const selectedItemIds = new Set(mySelections.map((selection) => selection.itemId))
  const selectableItems = items.filter((item) => !isBillSummaryItemName(item.name))
  const visibleItems = !isAdmin && (myLocked || isSessionLocked)
    ? selectableItems.filter((item) => selectedItemIds.has(item.id))
    : selectableItems
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
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border bg-brand/15 border-brand/30 text-brand hover:bg-brand/25 transition-all"
            >
              <CheckCircle size={12} /> Done
            </button>
          ) : undefined
        }
      />

      {/* Bill summary bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-surface-1 border-b border-border">
        <div className="flex-1">
          <p className="text-xs text-zinc-500">Invoice total</p>
          <p className="text-base font-bold text-brand">{formatCurrency(fixedBillTotal)}</p>
          {!isAdmin && (
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {mySelections.length} item{mySelections.length !== 1 ? 's' : ''} {myLocked ? 'locked' : 'selected'}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">{participants.length} people · {selectableItems.length} items</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {lockedCount}/{participants.length} done
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 gap-1">
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
                ? 'text-brand border-brand'
                : 'text-zinc-500 border-transparent hover:text-zinc-300',
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
                  className="w-full flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5"
                >
                  <AlertCircle size={14} className="text-yellow-400 shrink-0" />
                  <span className="text-xs text-yellow-300 flex-1 text-left">Some items have portion coverage issues</span>
                  {expandCoverage ? <ChevronUp size={14} className="text-yellow-400" /> : <ChevronDown size={14} className="text-yellow-400" />}
                </button>
                {expandCoverage && (
                  <div className="mt-2 space-y-1">
                    {selectableItems.map((item) => {
                      const cov = coverage[item.id] ?? 0
                      if (cov === 0 || (cov >= 99.99 && cov <= 100.01)) return null
                      return (
                        <div key={item.id} className="flex items-center justify-between bg-surface-1 rounded-lg px-3 py-2 text-xs">
                          <span className="text-zinc-300 truncate flex-1">{item.name}</span>
                          <span className={clsx('ml-2 font-medium', cov > 100.01 ? 'text-red-400' : 'text-yellow-400')}>
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
                  ? 'bg-brand/10 border-brand/30'
                  : 'bg-surface-1 border-border',
              )}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white">
                    {editingUser ? `Editing ${editingUser.name}'s selections` : 'Member selection editor'}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {editingUser
                      ? `${activeSelections.length} selected · changes save instantly`
                      : 'All menu items below are shared automatically with the selected participants.'}
                  </p>
                </div>
                {editingUser && (
                  <button
                    onClick={() => { setEditingUserId(''); setTab('people') }}
                    className="text-xs text-brand hover:text-brand-light transition-colors"
                  >
                    Done editing
                  </button>
                )}
              </div>
            )}
            <div className="mt-3 bg-surface-1 border-y border-border divide-y divide-border">
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
                    isAdmin={isAdmin}
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
                  />
                )
              })}

              {visibleItems.length === 0 && (
                <div className="py-12 text-center">
                  <Receipt size={24} className="text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">
                    {!isAdmin && (myLocked || isSessionLocked) ? 'No items selected' : 'No items on this bill'}
                  </p>
                </div>
              )}
            </div>

            {sharedChargesTotal > 0 && (
              <div className="mx-4 mt-3 flex items-start gap-2 bg-surface-1 border border-border rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 font-medium">Shared bill charges</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Staff contribution, tax, and rounding ({formatCurrency(sharedChargesTotal)}) are split equally among {participants.length} people = {formatCurrency(sharedChargesPerPerson)} each
                  </p>
                </div>
              </div>
            )}

            {!isAdmin && hasBillImage && (
              <button
                onClick={handleViewBillImage}
                className="mx-4 mt-3 w-[calc(100%_-_2rem)] flex items-center justify-center gap-2 bg-surface-1 border border-border hover:border-brand/30 rounded-xl px-4 py-3 text-xs font-medium text-zinc-400 hover:text-white transition-all"
              >
                <FileImage size={14} className="text-brand" /> View original bill
              </button>
            )}
          </div>
        )}

        {/* Split tab */}
        {tab === 'split' && (
          <div className="p-4 space-y-4">
            {/* Live lock status */}
            <div className="bg-surface-1 border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Who's locked in</p>
                {allParticipantsLocked && (
                  <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
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
                        ? 'bg-green-500/10 border-green-500/25 text-green-300'
                        : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-300',
                    )}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                      locked ? 'bg-green-500/30 text-green-200' : 'bg-yellow-500/20 text-yellow-300',
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
                  <p className="text-xs text-zinc-600 py-1">No participants yet</p>
                )}
              </div>
            </div>

            {/* Final split — only when everyone locked */}
            {allParticipantsLocked ? (
              <div className="animate-fade-in space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-brand" />
                    <p className="text-sm font-semibold text-white">Final Split</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={exportImage}
                      disabled={Boolean(exporting)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface-1 text-[11px] text-zinc-400 hover:text-white hover:border-brand/30 disabled:opacity-50 transition-all"
                    >
                      {exporting === 'image'
                        ? <Loader2 size={11} className="animate-spin" />
                        : <ImageDown size={11} />}
                      Image
                    </button>
                    <button
                      onClick={exportPdf}
                      disabled={Boolean(exporting)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface-1 text-[11px] text-zinc-400 hover:text-white hover:border-brand/30 disabled:opacity-50 transition-all"
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
                          ? 'bg-brand/10 border-brand/30'
                          : 'bg-surface-1 border-border',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
                            isMe ? 'bg-brand/25 text-brand' : 'bg-surface-3 text-zinc-300',
                          )}>
                            {s.userName[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-white">
                            {isMe ? `You (${s.userName})` : s.userName}
                          </span>
                        </div>
                        <span className={clsx('text-lg font-bold', isMe ? 'text-brand' : 'text-white')}>
                          {formatCurrency(s.grandTotal)}
                        </span>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-border/50">
                        {s.itemBreakdown.map(({ item, portionPercentage, amount }) => (
                          <div key={item.id} className="flex justify-between text-xs text-zinc-400">
                            <span className="truncate flex-1">
                              {item.name}
                              {portionPercentage < 100 && (
                                <span className="text-zinc-600 ml-1">({portionPercentage}%)</span>
                              )}
                            </span>
                            <span className="shrink-0 ml-2">{formatCurrency(amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-zinc-500 pt-1">
                          <span>Shared bill charges</span>
                          <span>{formatCurrency(s.cgstShare + s.sgstShare + s.additionalChargesShare)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-surface-1 border border-border rounded-2xl">
                <Clock size={20} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-400">Waiting for everyone to lock</p>
                <p className="text-xs text-zinc-600 mt-1">
                  {lockStatus.filter(x => x.locked).length}/{participants.length} locked in
                </p>
              </div>
            )}
          </div>
        )}

        {/* People tab */}
        {tab === 'people' && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Participants ({participants.length})</p>
            {participants.map((user) => {
              const userSels = sessionSelections.filter((s) => s.userId === user.id)
              const isUserLocked = (session.lockedParticipantIds ?? []).includes(user.id)
              const userSplit = splits.find((s) => s.userId === user.id)

              return (
                <div key={user.id} className="flex items-center gap-3 bg-surface-1 border border-border rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center text-sm font-bold text-zinc-300 shrink-0">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                      <span className={clsx(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                        isUserLocked
                          ? 'bg-green-500/10 border-green-500/25 text-green-400'
                          : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400',
                      )}>
                        {isUserLocked ? 'Done' : 'Pending'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {userSels.length} item{userSels.length !== 1 ? 's' : ''} selected
                      {isUserLocked ? ' · locked' : ''}
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => { setEditingUserId(user.id); setTab('items') }}
                        className="mt-1.5 flex items-center gap-1 text-xs text-brand hover:text-brand-light transition-colors"
                      >
                        <Pencil size={10} /> View / edit selections
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    {isAdmin && (
                      <p className="text-sm font-bold text-brand">
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
                            ? 'text-green-500 hover:text-green-300'
                            : 'text-yellow-500 hover:text-yellow-300',
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
                      className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              )
            })}

            {isAdmin && nonParticipants.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 mt-4">Add to session</p>
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
                    className="w-full flex items-center gap-3 bg-surface-1 border border-border border-dashed hover:border-brand/30 rounded-xl px-4 py-3 mb-2 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-xs font-bold text-zinc-500">
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm text-zinc-500 flex-1 text-left">{user.name}</span>
                    <UserPlus size={14} className="text-zinc-600" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!isAdmin && !isSessionLocked && tab === 'items' && (
        <div className="border-t border-border bg-surface-0/95 backdrop-blur-sm px-4 py-3 pb-safe">
          {myLocked ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm text-green-400 font-medium">Your selections are locked</span>
              </div>
              {!isSessionLocked && (
                <button
                  onClick={handleUnlockMine}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Unlock
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{mySelections.length} item{mySelections.length !== 1 ? 's' : ''} selected</span>
                <span>Review before locking</span>
              </div>
              <button
                onClick={handleLockMine}
                className="w-full py-3 bg-brand hover:bg-brand-light rounded-xl text-sm font-semibold text-surface-0 transition-all active:scale-98"
              >
                Lock My Selections
              </button>
            </div>
          )}
        </div>
      )}

      {/* My total bar when on split tab */}
      {tab === 'split' && !isAdmin && allParticipantsLocked && (
        <div className="border-t border-border bg-surface-0/95 backdrop-blur-sm px-4 py-4 pb-safe">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Your total</span>
            <span className="text-xl font-bold text-brand">
              {formatCurrency(splits.find((s) => s.userId === viewingUserId)?.grandTotal ?? 0)}
            </span>
          </div>
        </div>
      )}

      <Modal open={showBillImage} onClose={() => setShowBillImage(false)} title="Original bill" size="lg">
        {billImageLoading ? (
          <div className="h-72 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-brand" />
          </div>
        ) : billImageSrc ? (
          <img
            src={billImageSrc}
            alt={`Original bill from ${session.restaurantName || 'restaurant'}`}
            className="w-full max-h-[70vh] object-contain rounded-xl bg-white"
          />
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">Bill image unavailable</p>
        )}
      </Modal>
    </Layout>
  )
}
