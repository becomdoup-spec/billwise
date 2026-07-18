import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Loader2, ReceiptText, UserRound,
  Clock, CheckCircle, ChevronRight, UserRoundPlus, DoorOpen,
} from 'lucide-react'
import { PinPad } from '../components/auth/PinPad'
import { HoneycombGrid } from '../components/auth/HoneycombGrid'
import { ThemeToggle } from '../components/shared/ThemeToggle'
import { Modal } from '../components/shared/Modal'
import { GroupGate } from '../components/groups/GroupGate'
import { InviteModal } from '../components/groups/InviteLink'
import { playDoorTransition } from '../components/shared/DoorTransition'
import { useAppStore } from '../store/appStore'
import { hashPin, formatCurrency, computeSplits, isParticipantDone, isSessionComplete } from '../services/calculations'
import clsx from 'clsx'
import type { BillItem, ItemSelection, Session, User } from '../types'

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
  const { users, setCurrentUser, cloudReady, cloudSyncError, sessions, requirePin, showCompletedBills, billItems, selections, activeGroup, activeGroupId, legacyBypass, setActiveGroup } = useAppStore()
  const [step, setStep] = useState<Step>('profiles')
  const [role, setRole] = useState<Role>('user')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)

  // Gate first: no group entered (and not in the pre-migration classic space)
  // means the landing page is the group entry, like signing into an account.
  const atGate = !activeGroupId && !legacyBypass

  // Bill-picker modal state
  const [billPickerSession, setBillPickerSession] = useState<Session | null>(null)
  // Split popup state for completed bills
  const [splitPopup, setSplitPopup] = useState<{ session: Session; userId: string } | null>(null)
  const [splitPopupOpen, setSplitPopupOpen] = useState(false)
  const splitPopupTimerRef = useRef<number>(0)

  const openSplitPopup = (session: Session, userId: string) => {
    window.clearTimeout(splitPopupTimerRef.current)
    setSplitPopup({ session, userId })
    setSplitPopupOpen(true)
  }

  const closeSplitPopup = () => {
    setSplitPopupOpen(false)
    window.clearTimeout(splitPopupTimerRef.current)
    splitPopupTimerRef.current = window.setTimeout(() => setSplitPopup(null), 280)
  }

  useEffect(() => () => window.clearTimeout(splitPopupTimerRef.current), [])

  const regularUsers = users.filter((u) => u.role === 'user')
  const adminUsers = users.filter((u) => u.role === 'admin')
  const selectedUser = users.find((u) => u.id === selectedUserId)

  // Outstanding bills visible on landing page — not truly complete (someone unlocked OR an item has no selector)
  const outstandingBills = sessions.filter((s) => {
    if (!s.isPublic) return false
    return !isSessionComplete(s, billItems[s.id] ?? [], selections.filter((sel) => sel.sessionId === s.id))
  })

  // Completed bills — all participants locked AND every item claimed
  const completedBills = sessions.filter((s) => {
    if (!s.isPublic) return false
    return isSessionComplete(s, billItems[s.id] ?? [], selections.filter((sel) => sel.sessionId === s.id))
  })

  const openAdminAccess = () => {
    if (atGate || !cloudReady || cloudSyncError) return
    setRole('admin')
    setSelectedUserId(adminUsers[0]?.id ?? '')
    setTargetSessionId(null)
    setError('')
    setStep('pin')
  }

  const switchGroup = () => {
    playDoorTransition(() => {
      setActiveGroup(null)
      setStep('profiles')
    })
  }

  const loginUser = (user: User, sessionId: string | null = null) => {
    setCurrentUser(user)
    playDoorTransition(() => navigate(sessionId ? `/session/${sessionId}` : '/user'))
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
      if (admin) {
        setCurrentUser(admin)
        playDoorTransition(() => navigate('/admin'))
        return
      }
      setError('Incorrect admin PIN')
      return
    }

    const user = regularUsers.find((u) => u.id === selectedUserId && u.pin === hashedPin)
    if (user) { loginUser(user, targetSessionId); return }
    setError('Incorrect PIN')
  }

  return (
    <div className="flex h-[100dvh] min-h-[100svh] flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between">
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

      <main className="flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto py-6 sm:py-10">
        {atGate ? (
          <GroupGate />
        ) : step === 'profiles' ? (
          <div className="w-full max-w-4xl text-center animate-fade-in">
            {activeGroup ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-3">Shared moments. Fair splits.</p>
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg">{activeGroup.name}</h1>
                <p className="text-sm sm:text-base text-fg-subtle mt-3">Tap your profile to continue</p>

                {/* In-group actions — invite lives here, inside the group */}
                <div className="mt-5 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary transition-[border-color,background-color,transform] duration-150 hover:border-primary/60 hover:bg-primary/15 active:scale-[0.97]"
                  >
                    <UserRoundPlus size={13} />
                    Invite · <span className="font-mono tracking-wider">{activeGroup.inviteCode.toUpperCase()}</span>
                  </button>
                  <button
                    onClick={switchGroup}
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-fg-muted transition-[border-color,color,transform] duration-150 hover:border-line-strong hover:text-fg active:scale-[0.97]"
                  >
                    <DoorOpen size={13} />
                    Switch group
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-3">Shared moments. Fair splits.</p>
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg">Who&apos;s in the mix?</h1>
                <p className="text-sm sm:text-base text-fg-subtle mt-3">Claim yours &amp; Join the tally</p>
                <button
                  onClick={() => playDoorTransition(() => useAppStore.getState().setLegacyBypass(false))}
                  className="mx-auto mt-4 flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-fg-muted transition-[border-color,color,transform] duration-150 hover:border-primary/40 hover:text-fg active:scale-[0.97]"
                >
                  <DoorOpen size={13} /> Enter a group
                </button>
              </>
            )}

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
                <p className="text-sm text-fg-muted">
                  {activeGroup ? `No members in ${activeGroup.name} yet` : 'No member profiles yet'}
                </p>
                <p className="text-xs text-fg-faint mt-1">
                  {activeGroup
                    ? 'Share the invite link so people can join.'
                    : 'An admin can add members from the dashboard.'}
                </p>
                {activeGroup && (
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="mt-4 min-h-11 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    Get the invite link
                  </button>
                )}
              </div>
            )}

            {/* Bills sections — two-column layout */}
            {cloudReady && !cloudSyncError && (outstandingBills.length > 0 || (showCompletedBills && completedBills.length > 0)) && (
              <div className="mt-10 w-full max-w-2xl mx-auto text-left">
                <div className={clsx('grid gap-4', showCompletedBills ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
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
                            billItems={billItems[session.id] ?? []}
                            sessionSelections={selections.filter((selection) => selection.sessionId === session.id)}
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
                            billItems={billItems[session.id] ?? []}
                            sessionSelections={selections.filter((selection) => selection.sessionId === session.id)}
                            variant="completed"
                            onPickMember={(userId) => openSplitPopup(session, userId)}
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
          open={splitPopupOpen}
          userId={splitPopup.userId}
          users={users}
          billItems={billItems[splitPopup.session.id] ?? []}
          selections={selections.filter((s) => s.sessionId === splitPopup.session.id)}
          onClose={closeSplitPopup}
        />
      )}

      {activeGroup && (
        <InviteModal group={activeGroup} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  )
}

// ── Landing bill card ──────────────────────────────────────────────

function LandingBillCard({
  session, users, billItems, sessionSelections, onPickMember, variant = 'outstanding',
}: {
  session: Session
  users: User[]
  billItems: BillItem[]
  sessionSelections: ItemSelection[]
  onPickMember: (userId: string) => void
  variant?: 'outstanding' | 'completed'
}) {
  const [expanded, setExpanded] = useState(false)
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const participantDone = (uid: string) => isParticipantDone(session, uid)
  const doneCount = participants.filter((p) => participantDone(p.id)).length
  const pendingParticipants = participants.filter((p) => !participantDone(p.id))
  const visibleParticipants = pendingParticipants.length > 0 ? pendingParticipants : participants

  const isCompleted = variant === 'completed'
  const completedSplits = isCompleted
    ? computeSplits(
      billItems,
      sessionSelections,
      participants,
      session.cgst,
      session.sgst,
      session.lockedParticipantIds,
      session.totalAmount,
    )
    : []

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
        aria-expanded={expanded}
        className="flex min-h-11 w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-raised/40"
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
              const done = participantDone(p.id)
              return (
                <div
                  key={p.id}
                  title={`${p.name} — ${done ? 'done' : 'pending'}`}
                  className={clsx(
                    'w-5 h-5 rounded-full border border-canvas flex items-center justify-center text-[8px] font-bold',
                    done ? 'bg-success/30 text-success' : 'bg-warning/20 text-warning',
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
            <span className="text-[9px] text-fg-faint">{doneCount}/{participants.length}</span>
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
        <div className="animate-reveal border-t border-line/60 bg-canvas/40 px-3 py-2.5">
          {isCompleted ? (
            <>
              <p className="text-[9px] text-fg-faint uppercase tracking-wider mb-2">Tap your name to view your split</p>
              <div className="grid grid-cols-1 gap-1.5">
                {participants.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => onPickMember(p.id)}
                    className="group/member flex min-h-11 w-full items-center gap-2 rounded-lg border border-success/25 bg-success/[0.07] px-2.5 py-2 transition-[border-color,background-color,transform] duration-150 hover:border-success/40 hover:bg-success/15 active:scale-[0.99]"
                    title={`${p.name}: ${formatCurrency(completedSplits.find((split) => split.userId === p.id)?.grandTotal ?? 0)}`}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded-full bg-gradient-to-br flex items-center justify-center text-[8px] font-bold text-white shrink-0',
                      avatarStyles[i % avatarStyles.length],
                    )}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-left text-[10px] font-medium text-fg">
                      {p.name.split(' ')[0]}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-success transition-transform group-hover/member:translate-x-[-2px]">
                      {formatCurrency(completedSplits.find((split) => split.userId === p.id)?.grandTotal ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[9px] text-fg-faint uppercase tracking-wider mb-2">Tap your name</p>
              <div className="flex flex-wrap gap-1.5">
                {visibleParticipants.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => onPickMember(p.id)}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 transition-[border-color,background-color,transform] duration-150 hover:border-primary/40 active:scale-95"
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
  session, userId, users, billItems, selections, open, onClose,
}: {
  session: Session
  open: boolean
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
    <Modal open={open} onClose={onClose} title={`${user?.name ?? 'Member'}'s split`} size="sm">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
        <div className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white',
          avatarStyles[userIdx >= 0 ? userIdx % avatarStyles.length : 0],
        )}>
          {user?.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{user?.name}</p>
          <p className="truncate text-xs text-fg-subtle">{session.restaurantName}</p>
        </div>
      </div>

      <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
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

      {mySplit && (
          <div className="mt-4 space-y-1.5 rounded-xl border border-line bg-surface px-3 py-3">
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
    </Modal>
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
  const choices = pending.length > 0 ? pending : participants

  return (
    <Modal open onClose={onClose} title={session.restaurantName || 'Unnamed Bill'} size="sm">
        <p className="mb-4 text-xs text-fg-subtle">Who are you?</p>
        <div className="space-y-2">
          {choices.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-line px-4 py-3 transition-[border-color,background-color,transform] duration-150 hover:border-primary/40 hover:bg-surface-raised/50 active:scale-[0.99]"
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
    </Modal>
  )
}
