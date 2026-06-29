import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionSync } from '../hooks/useSessionSync'
import {
  Users, Receipt, BarChart3, Lock, UserPlus, UserMinus, Plus,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp, Clock, Sparkles, FileImage, Loader2, Pencil,
  ImageDown, FileDown, Trash2,
} from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { ItemCard } from '../components/bill/ItemCard'
import { useAppStore } from '../store/appStore'
import {
  computeSplits, getItemPortionCoverage, formatCurrency,
  getFixedBillTotal, getSessionCompletionState, isBillSummaryItemName,
  isParticipantDone, isPortionFullyAllocated,
} from '../services/calculations'
import { toast } from '../components/shared/Toast'
import { Modal } from '../components/shared/Modal'
import { dbGetBillImageUrl } from '../lib/db'
import { downloadSplitImage, downloadSplitPdf } from '../services/splitExport'
import clsx from 'clsx'

type Tab = 'items' | 'split' | 'people'
type BillEditorDraft = { name: string; quantity: string; totalPrice: string }

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
  const [showBillEditor, setShowBillEditor] = useState(false)
  const [billEditorDrafts, setBillEditorDrafts] = useState<Record<string, BillEditorDraft>>({})
  const [billEditorSaving, setBillEditorSaving] = useState(false)
  const [showChooseItemsIntro, setShowChooseItemsIntro] = useState(false)
  const [showLockDoneModal, setShowLockDoneModal] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')

  useSessionSync(id)

  const session = sessions.find((s) => s.id === id)
  const isAdmin = currentUser?.role === 'admin'
  const isCreator = !isAdmin && session?.createdBy === currentUser?.id

  useEffect(() => {
    if (!session || !currentUser || currentUser.role === 'admin') return
    if (!session.participantIds.includes(currentUser.id)) return
    if ((session.lockedParticipantIds ?? []).includes(currentUser.id)) return

    const introKey = `billwise:choose-items-intro:${session.id}:${currentUser.id}`
    if (window.localStorage.getItem(introKey)) return
    setShowChooseItemsIntro(true)
  }, [
    session?.id,
    session?.participantIds.join('|'),
    session?.lockedParticipantIds?.join('|'),
    currentUser?.id,
    currentUser?.role,
  ])

  if (!session) return (
    <Layout>
      <Header title="Session not found" back />
      <div className="flex-1 flex items-center justify-center p-8 text-fg-subtle text-sm">
        This session does not exist.
      </div>
    </Layout>
  )

  const items = billItems[session.id] ?? []
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const sessionSelections = selections.filter((s) => s.sessionId === session.id)
  const completionState = getSessionCompletionState(session, items, sessionSelections)
  const isSessionComplete = completionState.complete
  const isSessionLocked = isSessionComplete

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
  const hasCoverageIssues = selectableItems.some((item) =>
    !isPortionFullyAllocated(coverage[item.id] ?? 0),
  )
  const nonParticipants = users.filter((u) => u.role === 'user' && !session.participantIds.includes(u.id))

  // Keep participant status aligned with the same completion semantics as the store.
  const lockStatus = participants.map((p) => {
    const pSels = sessionSelections.filter((s) => s.userId === p.id)
    const isLocked = isParticipantDone(session, p.id)
    const isDone = isLocked
    return { user: p, locked: isLocked, done: isDone, count: pSels.length }
  })
  const allParticipantsLocked = completionState.everyoneLocked
  const hasBillImage = Boolean(session.billImageBase64 || session.billImageUrl)
  const canEditBillContents = isAdmin || isCreator

  const dismissChooseItemsIntro = () => {
    if (currentUser) {
      window.localStorage.setItem(`billwise:choose-items-intro:${session.id}:${currentUser.id}`, 'seen')
    }
    setShowChooseItemsIntro(false)
  }

  const openBillEditor = () => {
    setBillEditorDrafts(Object.fromEntries(
      selectableItems.map((item) => [
        item.id,
        {
          name: item.name,
          quantity: String(item.quantity),
          totalPrice: String(item.totalPrice),
        },
      ]),
    ))
    setNewItemName('')
    setNewItemPrice('')
    setShowBillEditor(true)
  }

  const updateBillEditorDraft = (itemId: string, data: Partial<BillEditorDraft>) => {
    setBillEditorDrafts((drafts) => ({
      ...drafts,
      [itemId]: {
        name: drafts[itemId]?.name ?? '',
        quantity: drafts[itemId]?.quantity ?? '1',
        totalPrice: drafts[itemId]?.totalPrice ?? '0',
        ...data,
      },
    }))
  }

  const handleSaveBillEditor = async () => {
    setBillEditorSaving(true)
    try {
      const normalized = selectableItems.map((item) => {
        const draft = billEditorDrafts[item.id] ?? {
          name: item.name,
          quantity: String(item.quantity),
          totalPrice: String(item.totalPrice),
        }
        const name = draft.name.trim()
        const quantity = Number(draft.quantity)
        const totalPrice = Number(draft.totalPrice)

        if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalPrice) || totalPrice < 0) {
          throw new Error('invalid')
        }

        return { item, name, quantity, totalPrice }
      })

      const updates = normalized.map(({ item, name, quantity, totalPrice }) => {
        if (name === item.name && quantity === item.quantity && totalPrice === item.totalPrice) {
          return Promise.resolve()
        }

        const unitPrice = Math.round((totalPrice / quantity) * 100) / 100
        return updateBillItem(session.id, item.id, { name, quantity, totalPrice, unitPrice })
      })

      await Promise.all(updates)
      toast.success('Uploaded bill contents updated')
      setShowBillEditor(false)
    } catch {
      toast.error('Check item names, quantities, and amounts before saving')
    } finally {
      setBillEditorSaving(false)
    }
  }

  const handleAddBillEditorItem = async () => {
    const name = newItemName.trim()
    const price = Number(newItemPrice)
    if (!name || !Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid item name and amount')
      return
    }

    try {
      const item = await addBillItem(session.id, {
        name,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
      })
      setBillEditorDrafts((drafts) => ({
        ...drafts,
        [item.id]: { name: item.name, quantity: String(item.quantity), totalPrice: String(item.totalPrice) },
      }))
      setNewItemName('')
      setNewItemPrice('')
      toast.success('Item added to uploaded bill')
    } catch {
      toast.error('Item could not be added')
    }
  }

  const handleRemoveBillEditorItem = async (itemId: string) => {
    try {
      await removeBillItem(session.id, itemId)
      setBillEditorDrafts((drafts) => {
        const next = { ...drafts }
        delete next[itemId]
        return next
      })
      toast.info('Item removed from uploaded bill')
    } catch {
      toast.error('Item could not be removed')
    }
  }

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
      setShowLockDoneModal(true)
    } catch {
      toast.error('Selections could not be locked')
    }
  }

  const closeLockDoneModal = () => {
    setShowLockDoneModal(false)
    navigate('/user')
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
    if (!isSessionComplete) {
      toast.error('Final split needs all members locked and every item allocated')
      return
    }
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
    if (!isSessionComplete) {
      toast.error('Final split needs all members locked and every item allocated')
      return
    }
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
        showExit
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
          ) : myLocked ? (
            <button
              onClick={handleUnlockMine}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border bg-surface border-line text-fg-muted hover:bg-surface-raised hover:text-fg transition-all active:scale-95"
            >
              <Lock size={12} /> Unlock
            </button>
          ) : undefined
        }
      />

      {/* Bill summary bar */}
      <div className="flex shrink-0 items-center gap-4 px-4 py-3 bg-surface border-b border-line">
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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-line px-4 gap-1">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Items tab */}
        {tab === 'items' && (
          <div className="pb-32">
            {/* Coverage warning */}
            {isAdmin && hasCoverageIssues && (
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
                      if (isPortionFullyAllocated(cov)) return null
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

            {canEditBillContents && (
              <div className="mx-4 mt-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-overlay">
                    <Receipt size={15} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-fg">Uploaded bill contents</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-fg-subtle">
                      Correct item names, quantities, or amounts here. The selection list keeps bill amounts locked.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openBillEditor}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                </div>
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
                    isAdmin={isAdmin}
                    canEditBill={false}
                    canEditSelection={!isAdmin || Boolean(editingUser)}
                    showSelectionControl={!isAdmin || Boolean(editingUser)}
                    onSelect={handleSelect}
                    onDeselect={handleDeselect}
                    onPortionChange={handlePortion}
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
                {isSessionComplete && (
                  <span className="text-[10px] text-success font-semibold flex items-center gap-1">
                    <CheckCircle size={10} /> All done
                  </span>
                )}
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {lockStatus.map(({ user, done, locked, count }) => (
                  <div
                    key={user.id}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                      done
                        ? 'bg-success/10 border-success/25 text-success'
                        : 'bg-warning/10 border-warning/25 text-warning',
                    )}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                      done ? 'bg-success/30 text-success' : 'bg-warning/20 text-warning',
                    )}>
                      {user.name[0]?.toUpperCase()}
                    </div>
                    {user.id === viewingUserId ? 'You' : user.name.split(' ')[0]}
                    <span className="opacity-70">
                      · {done ? 'Done' : locked && count === 0 ? 'Locked' : 'Pending'}
                    </span>
                    {done
                      ? <Lock size={9} />
                      : <Clock size={9} className="opacity-50" />}
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-xs text-fg-faint py-1">No participants yet</p>
                )}
              </div>
            </div>

            {/* Final split — only when everyone locked and all items are fully allocated */}
            {isSessionComplete ? (
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
                <p className="text-sm font-medium text-fg-muted">
                  {allParticipantsLocked && !completionState.allItemsAllocated
                    ? 'Some items need portion review'
                    : 'Waiting for everyone to lock'}
                </p>
                <p className="text-xs text-fg-faint mt-1">
                  {allParticipantsLocked && !completionState.allItemsAllocated
                    ? 'Adjust portions until every item is 100% allocated'
                    : `${lockStatus.filter(x => x.locked).length}/${participants.length} locked in`}
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
              const isUserLocked = isParticipantDone(session, user.id)
              const isUserDone = isUserLocked
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
                        isUserDone
                          ? 'bg-success/10 border-success/25 text-success'
                          : 'bg-warning/10 border-warning/25 text-warning',
                      )}>
                        {isUserDone ? 'Done' : isUserLocked ? 'Locked' : 'Pending'}
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
                          isUserDone
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
        <div className="shrink-0 border-t border-line bg-canvas/95 backdrop-blur-sm px-4 py-3 pb-safe">
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
      {tab === 'split' && !isAdmin && isSessionComplete && (
        <div className="shrink-0 border-t border-line bg-canvas/95 backdrop-blur-sm px-4 py-4 pb-safe">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Your total</span>
            <span key={splits.find((s) => s.userId === viewingUserId)?.grandTotal} className="text-xl font-bold text-primary animate-pop">
              {formatCurrency(splits.find((s) => s.userId === viewingUserId)?.grandTotal ?? 0)}
            </span>
          </div>
        </div>
      )}

      <Modal
        open={showChooseItemsIntro}
        onClose={dismissChooseItemsIntro}
        title="Bill uploaded"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/[0.07] px-4 py-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle size={14} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">Bill uploaded. Now choose your items.</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                Select only what you consumed. For shared items, use Portion to enter your percentage or amount. Bill quantity and amount are locked on this screen.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissChooseItemsIntro}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-fg transition-all hover:bg-primary-hover active:scale-98"
          >
            Choose items
          </button>
        </div>
      </Modal>

      <Modal
        open={showLockDoneModal}
        onClose={closeLockDoneModal}
        title="Items locked"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/[0.07] px-4 py-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle size={14} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">Your items are locked now.</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                You will be taken back to your outstanding bills.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLockDoneModal}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-fg transition-all hover:bg-primary-hover active:scale-98"
          >
            Back to my bills
          </button>
        </div>
      </Modal>

      <Modal
        open={showBillEditor}
        onClose={() => setShowBillEditor(false)}
        title="Edit uploaded bill"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-fg-subtle">
            Correct the uploaded bill here when OCR or formatting reads a row incorrectly. Diners cannot change these amounts while selecting items.
          </p>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {selectableItems.map((item) => {
              const draft = billEditorDrafts[item.id] ?? {
                name: item.name,
                quantity: String(item.quantity),
                totalPrice: String(item.totalPrice),
              }

              return (
                <div key={item.id} className="rounded-xl border border-line bg-surface px-3 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={draft.name}
                        onChange={(event) => updateBillEditorDraft(item.id, { name: event.target.value })}
                        placeholder="Item name"
                        className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">Qty</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.quantity}
                            onChange={(event) => updateBillEditorDraft(item.id, { quantity: event.target.value })}
                            className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg focus:border-primary/60 focus:outline-none"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">Amount</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.totalPrice}
                            onChange={(event) => updateBillEditorDraft(item.id, { totalPrice: event.target.value })}
                            className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg focus:border-primary/60 focus:outline-none"
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBillEditorItem(item.id)}
                      className="mt-0.5 rounded-lg p-2 text-fg-faint transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}

            {selectableItems.length === 0 && (
              <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
                <Receipt size={20} className="mx-auto mb-2 text-fg-faint" />
                <p className="text-xs text-fg-subtle">No bill items yet</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-line bg-surface px-3 py-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Add missing item</p>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <input
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                placeholder="Item name"
                className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
              />
              <input
                value={newItemPrice}
                onChange={(event) => setNewItemPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Amount"
                inputMode="decimal"
                className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddBillEditorItem}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <Plus size={12} />
              Add item now
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowBillEditor(false)}
              disabled={billEditorSaving}
              className="flex-1 rounded-xl border border-line py-3 text-sm text-fg-muted transition-colors hover:bg-surface-overlay disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBillEditor}
              disabled={billEditorSaving}
              className="flex-[2] rounded-xl bg-primary py-3 text-sm font-semibold text-primary-fg transition-all hover:bg-primary-hover disabled:bg-surface-overlay disabled:text-fg-faint"
            >
              {billEditorSaving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </span>
              ) : 'Save bill contents'}
            </button>
          </div>
        </div>
      </Modal>

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
