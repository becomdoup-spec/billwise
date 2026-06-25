import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dbGetUsers, dbGetSessions, dbGetAllBillItems, dbGetAllSelections } from '../lib/db'
import {
  AlertCircle, ArrowLeft, Loader2, ReceiptText, UserRound,
  Clock, CheckCircle, ChevronRight, X,
} from 'lucide-react'
import { PinPad } from '../components/auth/PinPad'
import { HoneycombGrid } from '../components/auth/HoneycombGrid'
import { ThemeToggle } from '../components/shared/ThemeToggle'
import { useAppStore } from '../store/appStore'
import { hashPin, formatCurrency, computeSplits } from '../services/calculations'
import clsx from 'clsx'
import type { Session, User } from '../types'

type Step = 'profiles' | 'pin'
type Role = 'admin' | 'user'

const avatarStyles = [
  'from-orange-300 to-rose-500',
  'from-sky-300 to-blue-600',
  'from-emerald-300 to-teal-600',
  'from-violet-300 to-purple-600',
  'from-amber-200 to-orange-500',
  'from-pink-300 to-fuchsia-600',
]

function getAvatarStyle(user: User, allUsers: User[]) {
  const idx = allUsers.filter((u) => u.role === 'user').findIndex((u) => u.id === user.id)
  return avatarStyles[Math.max(0, idx) % avatarStyles.length]
}

export function AuthPage() {
  const navigate = useNavigate()
  const { users, setCurrentUser, cloudReady, cloudSyncError, sessions, requirePin, showCompletedBills, billItems, selections, hydrateFromSupabase, hydrateBillItemsFromSupabase, hydrateSelectionsFromSupabase } = useAppStore()
  const [step, setStep] = useState<Step>('profiles')
  const [role, setRole] = useState<Role>('user')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Bill-picker modal state
  const [billPickerSession, setBillPickerSession] = useState<Session | null>(null)
  // Split popup state for completed bills
  const [splitPopup, setSplitPopup] = useState<{ session: Session; userId: string } | null>(null)

  // Force-refresh all data every time the landing page is visible
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const [freshUsers, freshSessions, freshItems, freshSelections] = await Promise.all([
          dbGetUsers(), dbGetSessions(), dbGetAllBillItems(), dbGetAllSelections(),
        ])
        if (cancelled) return
        hydrateFromSupabase(freshUsers, freshSessions)
        hydrateBillItemsFromSupabase(freshItems)
        hydrateSelectionsFromSupabase(freshSelections)
      } catch { /* polling in useSupabaseInit will catch it */ }
    }
    refresh()
    return () => { cancelled = true }
  }, [])

  const regularUsers = users.filter((u) => u.role === 'user')
  const adminUsers = users.filter((u) => u.role === 'admin')
  const selectedUser = users.find((u) => u.id === selectedUserId)

  // Outstanding bills visible on landing page
  const outstandingBills = sessions.filter((s) => {
    if (!s.isPublic) return false
    const allLocked = s.participantIds.length > 0
      && s.participantIds.every((id) => (s.lockedParticipantIds ?? []).includes(id))
    return !allLocked
  })

  // Completed bills — all participants locked in
  const completedBills = sessions.filter((s) => {
    if (!s.isPublic) return false
    return s.participantIds.length > 0
      && s.participantIds.every((id) => (s.lockedParticipantIds ?? []).includes(id))
  })

  const openAdminAccess = () => {
    if (!cloudReady || cloudSyncError) return
    setRole('admin')
    setSelectedUserId(adminUsers[0]?.id ?? '')
    setTargetSessionId(null)
    setError('')
    setStep('pin')
  }

  const loginUser = (user: User, sessionId: string | null = null) => {
    setCurrentUser(user)
    navigate(sessionId ? `/session/${sessionId}` : '/user')
  }

  const selectMember = (userId: string, sessionId: string | null = null) => {
    setRole('user')
    setSelectedUserId(userId)
    setTargetSessionId(sessionId)
    setError('')

    if (!requirePin) {
      // Skip PIN — log in directly
      const user = regularUsers.find((u) => u.id === userId)
      if (user) { loginUser(user, sessionId); return }
    }
    setStep('pin')
  }

  const handlePinComplete = (pin: string) => {
    setError('')
    const hashedPin = hashPin(pin)

    if (role === 'admin') {
      const admin = adminUsers.find((u) => u.pin === hashedPin)
      if (admin) { setCurrentUser(admin); navigate('/admin'); return }
      setError('Incorrect admin PIN')
      return
    }

    const user = regularUsers.find((u) => u.id === selectedUserId && u.pin === hashedPin)
    if (user) { loginUser(user, targetSessionId); return }
    setError('Incorrect PIN')
  }

  return (
    <div className="min-h-screen flex flex-col px-6 py-8 sm:py-12">
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <button
          onClick={openAdminAccess}
          className="group inline-flex items-center gap-2.5 rounded-xl"
          aria-label="Open admin access"
          title="Admin access"
        >
          <span className="relative w-10 h-11 rounded-lg bg-primary text-primary-fg flex items-center justify-center shadow-glow transition-transform group-hover:-translate-y-0.5">
            <ReceiptText size={22} strokeWidth={2.2} />
            <span className="absolute -bottom-1 left-1.5 w-2 h-2 bg-primary rotate-45" />
          </span>
          <span className="text-2xl font-bold text-fg tracking-tight">BillWise</span>
        </button>
        <ThemeToggle />
      </div>

      <main className="flex-1 flex items-center justify-center w-full py-10">
        {step === 'profiles' ? (
          <div className="w-full max-w-4xl text-center animate-fade-in">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-3">Shared moments. Fair splits.</p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg">Who&apos;s in the mix?</h1>
            <p className="text-sm sm:text-base text-fg-subtle mt-3">Claim yours &amp; Join the tally</p>

            {!cloudReady ? (
              <div className="mt-12 flex items-center justify-center gap-2 text-sm text-fg-subtle">
                <Loader2 size={16} className="animate-spin text-primary" /> Loading live profiles…
              </div>
            ) : cloudSyncError ? (
              <div className="mt-12 mx-auto max-w-sm rounded-2xl border border-danger/20 bg-danger/5 px-6 py-6">
                <AlertCircle size={22} className="text-danger mx-auto mb-3" />
                <p className="text-sm text-danger">Live profiles could not be loaded</p>
                <p className="text-xs text-fg-subtle mt-1">{cloudSyncError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 text-xs text-primary hover:text-primary-hover"
                >
                  Retry connection
                </button>
              </div>
            ) : regularUsers.length > 0 ? (
              <div className="mt-8 sm:mt-10 w-full flex justify-center overflow-hidden">
                <HoneycombGrid
                  users={regularUsers}
                  avatarStyles={avatarStyles}
                  onSelect={selectMember}
                />
              </div>
            ) : (
              <div className="mt-12 mx-auto max-w-sm rounded-3xl border border-line bg-surface px-6 py-10 shadow-card">
                <UserRound size={28} className="text-fg-faint mx-auto mb-3" />
                <p className="text-sm text-fg-muted">No member profiles yet</p>
                <p className="text-xs text-fg-faint mt-1">An admin can add members from the dashboard.</p>
              </div>
            )}

            {/* Bills sections — two-column layout */}
            {cloudReady && !cloudSyncError && (outstandingBills.length > 0 || (showCompletedBills && completedBills.length > 0)) && (
              <div className="mt-10 w-full max-w-2xl mx-auto text-left">
                <div className={clsx('grid gap-4', showCompletedBills ? 'grid-cols-2' : 'grid-cols-1')}>
                  {/* Left column — Outstanding */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Awaiting input</p>
                    </div>
                    {outstandingBills.length > 0 ? (
                      <div className="space-y-2">
                        {outstandingBills.map((session) => (
                          <LandingBillCard
                            key={session.id}
                            session={session}
                            users={users}
                            variant="outstanding"
                            onPickMember={(userId) => {
                              setBillPickerSession(null)
                              selectMember(userId, session.id)
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-line/60 p-4 text-center">
                        <p className="text-[10px] text-fg-faint">All caught up</p>
                      </div>
                    )}
                  </div>

                  {/* Right column — Completed (admin-controlled visibility) */}
                  {showCompletedBills && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <CheckCircle size={10} className="text-success shrink-0" />
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Completed</p>
                      </div>
                      {completedBills.length > 0 ? (
                        <div className="space-y-2">
                          {completedBills.map((session) => (
                            <LandingBillCard
                              key={session.id}
                              session={session}
                              users={users}
                              variant="completed"
                              onPickMember={(userId) => setSplitPopup({ session, userId })}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-line/60 p-4 text-center">
                          <p className="text-[10px] text-fg-faint">Nothing recent</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm animate-slide-up">
            <button
              onClick={() => { setStep('profiles'); setError(''); setTargetSessionId(null) }}
              className="mb-8 text-xs text-fg-subtle hover:text-fg transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={14} /> Back to profiles
            </button>

            <div className="text-center mb-7">
              {role === 'user' ? (
                <div className={clsx(
                  'w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-card',
                  getAvatarStyle(selectedUser ?? regularUsers[0], users),
                )}>
                  <span className="text-2xl font-bold text-white">
                    {selectedUser?.name.trim().charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                  <ReceiptText size={25} className="text-primary" />
                </div>
              )}
              <p className="text-base font-semibold text-fg">
                {role === 'admin' ? 'Admin access' : selectedUser?.name}
              </p>
              {targetSessionId && (
                <p className="text-xs text-primary mt-1">→ Entering session directly</p>
              )}
              <p className="text-xs text-fg-subtle mt-1">Enter your 4-digit PIN</p>
            </div>

            <PinPad onComplete={handlePinComplete} error={error} maxLength={4} />
          </div>
        )}
      </main>

      {/* Bill member picker modal */}
      {billPickerSession && (
        <BillMemberPickerModal
          session={billPickerSession}
          users={users}
          onSelect={(userId) => {
            setBillPickerSession(null)
            selectMember(userId, billPickerSession.id)
          }}
          onClose={() => setBillPickerSession(null)}
        />
      )}

      {splitPopup && (
        <SplitPopupModal
          session={splitPopup.session}
          userId={splitPopup.userId}
          users={users}
          billItems={billItems[splitPopup.session.id] ?? []}
          selections={selections.filter((s) => s.sessionId === splitPopup.session.id)}
          onClose={() => setSplitPopup(null)}
        />
      )}
    </div>
  )
}

// ── Landing bill card ──────────────────────────────────────────────

function LandingBillCard({
  session, users, onPickMember, variant = 'outstanding',
}: {
  session: Session
  users: User[]
  onPickMember: (userId: string) => void
  variant?: 'outstanding' | 'completed'
}) {
  const [expanded, setExpanded] = useState(false)
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const lockedCount = participants.filter((p) => (session.lockedParticipantIds ?? []).includes(p.id)).length
  const pendingParticipants = participants.filter((p) => !(session.lockedParticipantIds ?? []).includes(p.id))

  const isCompleted = variant === 'completed'

  // Time remaining badge for completed bills
  let timeLeft = ''
  if (isCompleted && session.completedAt) {
    const msLeft = new Date(session.completedAt).getTime() + 2 * 24 * 60 * 60 * 1000 - Date.now()
    if (msLeft > 0) {
      const h = Math.ceil(msLeft / (1000 * 60 * 60))
      timeLeft = h >= 24 ? `${Math.ceil(h / 24)}d left` : `${h}h left`
    }
  }

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm ${isCompleted ? 'bg-surface/60 border-line/60' : 'bg-surface border-line'}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-col gap-2 px-3 py-2.5 text-left hover:bg-surface-raised/40 transition-colors"
      >
        {/* Top row: icon + name */}
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isCompleted ? 'bg-success/15' : 'bg-warning/15'}`}>
            {isCompleted
              ? <CheckCircle size={11} className="text-success" />
              : <Clock size={11} className="text-warning" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-fg truncate">{session.restaurantName || 'Unnamed'}</p>
            <p className="text-[9px] text-fg-faint">{session.date}</p>
          </div>
          <ChevronRight size={11} className={`text-fg-faint shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>

        {/* Middle row: member bubbles */}
        <div className="flex items-center gap-1.5 pl-8">
          <div className="flex -space-x-1">
            {participants.slice(0, 5).map((p, i) => {
              const isLocked = (session.lockedParticipantIds ?? []).includes(p.id)
              return (
                <div
                  key={p.id}
                  title={`${p.name} — ${isLocked ? 'done' : 'pending'}`}
                  className={clsx(
                    'w-5 h-5 rounded-full border border-canvas flex items-center justify-center text-[8px] font-bold',
                    isLocked ? 'bg-success/30 text-success' : 'bg-warning/20 text-warning',
                  )}
                  style={{ zIndex: participants.length - i }}
                >
                  {p.name[0]?.toUpperCase()}
                </div>
              )
            })}
            {participants.length > 5 && (
              <div className="w-5 h-5 rounded-full border border-canvas bg-surface-overlay flex items-center justify-center text-[8px] text-fg-faint">
                +{participants.length - 5}
              </div>
            )}
          </div>
          {!isCompleted && (
            <span className="text-[9px] text-fg-faint">{lockedCount}/{participants.length}</span>
          )}
        </div>

        {/* Bottom row: amount + time */}
        <div className="flex items-center justify-between pl-8">
          <span className={`text-xs font-bold ${isCompleted ? 'text-success' : 'text-primary'}`}>
            {formatCurrency(session.totalAmount)}
          </span>
          {timeLeft && (
            <span className="text-[9px] text-fg-faint">{timeLeft}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line/60 px-3 py-2.5 bg-canvas/40">
          {isCompleted ? (
            <>
              <p className="text-[9px] text-fg-faint uppercase tracking-wider mb-2">Tap your name to view your split</p>
              <div className="flex flex-wrap gap-1.5">
                {participants.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => onPickMember(p.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-success/30 bg-success/10 hover:bg-success/20 transition-all active:scale-95"
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full bg-gradient-to-br flex items-center justify-center text-[8px] font-bold text-white shrink-0',
                      avatarStyles[i % avatarStyles.length],
                    )}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-success text-[10px] font-medium">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[9px] text-fg-faint uppercase tracking-wider mb-2">Tap your name</p>
              <div className="flex flex-wrap gap-1.5">
                {pendingParticipants.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => onPickMember(p.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-line bg-surface-raised hover:border-primary/40 transition-all active:scale-95"
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full bg-gradient-to-br flex items-center justify-center text-[8px] font-bold text-white shrink-0',
                      avatarStyles[i % avatarStyles.length],
                    )}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-fg text-[10px]">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Split popup modal (completed bills) ───────────────────────────

function SplitPopupModal({
  session, userId, users, billItems, selections, onClose,
}: {
  session: Session
  userId: string
  users: User[]
  billItems: import('../types').BillItem[]
  selections: import('../types').ItemSelection[]
  onClose: () => void
}) {
  const user = users.find((u) => u.id === userId)
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const userIdx = participants.findIndex((u) => u.id === userId)

  const splits = computeSplits(
    billItems,
    selections,
    participants,
    session.cgst,
    session.sgst,
    session.lockedParticipantIds,
    session.totalAmount,
  )
  const mySplit = splits.find((s) => s.userId === userId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface rounded-3xl border border-line shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white shrink-0',
              avatarStyles[userIdx >= 0 ? userIdx % avatarStyles.length : 0],
            )}>
              {user?.name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">{user?.name}</p>
              <p className="text-xs text-fg-subtle truncate max-w-[160px]">{session.restaurantName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-fg-faint hover:text-fg-muted p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Item breakdown */}
        <div className="px-5 py-3 max-h-[40vh] overflow-y-auto space-y-1.5">
          {mySplit && mySplit.itemBreakdown.length > 0 ? (
            mySplit.itemBreakdown.map(({ item, portionPercentage, amount }) => (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-fg truncate">{item.name}</p>
                  {portionPercentage < 100 && (
                    <p className="text-[10px] text-fg-faint">{portionPercentage}% share</p>
                  )}
                </div>
                <p className="text-xs font-medium text-fg shrink-0">{formatCurrency(amount)}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-fg-faint text-center py-4">No items selected</p>
          )}
        </div>

        {/* Totals */}
        {mySplit && (
          <div className="px-5 py-3 border-t border-line space-y-1.5 bg-surface-raised/40">
            <div className="flex justify-between text-xs text-fg-subtle">
              <span>Items</span>
              <span>{formatCurrency(mySplit.itemsTotal)}</span>
            </div>
            {(mySplit.cgstShare > 0 || mySplit.sgstShare > 0) && (
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>Tax share</span>
                <span>{formatCurrency(mySplit.cgstShare + mySplit.sgstShare)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-fg pt-1 border-t border-line">
              <span>Your total</span>
              <span className="text-success">{formatCurrency(mySplit.grandTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bill member picker modal ───────────────────────────────────────

function BillMemberPickerModal({
  session, users, onSelect, onClose,
}: {
  session: Session
  users: User[]
  onSelect: (userId: string) => void
  onClose: () => void
}) {
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const pending = participants.filter((p) => !(session.lockedParticipantIds ?? []).includes(p.id))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 bg-surface rounded-3xl border border-line shadow-2xl p-6 animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-fg-faint hover:text-fg-muted p-1">
          <X size={18} />
        </button>
        <p className="text-sm font-semibold text-fg mb-1">{session.restaurantName || 'Unnamed Bill'}</p>
        <p className="text-xs text-fg-subtle mb-4">Who are you?</p>
        <div className="space-y-2">
          {pending.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:border-primary/40 hover:bg-surface-raised/50 transition-all group"
            >
              <div className={clsx(
                'w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-base font-bold text-white shrink-0',
                avatarStyles[i % avatarStyles.length],
              )}>
                {p.name[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium text-fg flex-1 text-left">{p.name}</span>
              <ChevronRight size={14} className="text-fg-faint group-hover:text-fg-muted transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
