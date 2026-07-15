import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, Lock, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { Modal } from '../components/shared/Modal'
import { toast } from '../components/shared/Toast'
import { useAppStore } from '../store/appStore'
import { formatCurrency, computeSplits, isParticipantDone, isSessionComplete } from '../services/calculations'
import clsx from 'clsx'
import type { Session, User } from '../types'

const avatarStyles = [
  'from-orange-300 to-rose-500',
  'from-sky-300 to-blue-600',
  'from-emerald-300 to-teal-600',
  'from-violet-300 to-purple-600',
  'from-amber-200 to-orange-500',
  'from-pink-300 to-fuchsia-600',
]

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export function UserDashboard() {
  const navigate = useNavigate()
  const {
    sessions,
    pendingSessionIds,
    users,
    billItems,
    selections,
    currentUser,
    cloudReady,
    cloudSyncError,
    selectionsReady,
    deleteSession,
  } = useAppStore()
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [deleting, setDeleting] = useState(false)
  const splitDataReady = cloudReady && selectionsReady && !cloudSyncError

  const mySessions = sessions.filter(
    (s) => s.isPublic && s.participantIds.includes(currentUser?.id ?? ''),
  )

  const outstanding = mySessions.filter((s) => {
    return !isSessionComplete(s, billItems[s.id] ?? [], selections.filter((sel) => sel.sessionId === s.id))
  })

  const completed = mySessions.filter((s) => {
    if (!isSessionComplete(s, billItems[s.id] ?? [], selections.filter((sel) => sel.sessionId === s.id))) return false
    if (!s.completedAt) return true // legacy: show always
    return Date.now() - new Date(s.completedAt).getTime() < TWO_DAYS_MS
  })

  const sessionsBeingCreated = sessions.filter((session) => (
    pendingSessionIds.includes(session.id) && session.createdBy === currentUser?.id
  ))
  const isEmpty = outstanding.length === 0 && completed.length === 0 && sessionsBeingCreated.length === 0
  const billsNeedingMyAction = outstanding.filter((session) => (
    !isParticipantDone(session, currentUser?.id ?? '')
  )).length

  return (
    <Layout>
      <Header
        title="My Bills"
        subtitle={currentUser?.name}
        showLogout
        rightAction={
          <button
            onClick={() => navigate('/user/new-session')}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-fg transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-95"
          >
            <Plus size={13} />
            New Bill
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6 animate-list">
        {!splitDataReady && isEmpty ? (
          <div className="space-y-3 py-4" role="status" aria-label="Loading bills">
            <div className="skeleton h-28 rounded-xl" />
            <div className="skeleton h-28 rounded-xl" />
            <p className="flex items-center justify-center gap-2 text-xs text-fg-subtle">
              <Loader2 size={13} className="animate-spin text-primary" /> Checking for active bills…
            </p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-line flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-fg-faint" />
            </div>
            <p className="text-sm font-medium text-fg-muted">No active bills</p>
            <p className="text-xs text-fg-faint mt-1">Your admin hasn't shared any bills with you yet</p>
          </div>
        ) : (
          <>
            {sessionsBeingCreated.length > 0 && (
              <section aria-live="polite">
                <div className="mb-3 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Creating</p>
                  <span className="ml-auto text-[10px] text-fg-faint">Saving in the background</span>
                </div>
                <div className="space-y-3">
                  {sessionsBeingCreated.map((session) => (
                    <div key={session.id} className="rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                          <Loader2 size={17} className="animate-spin text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-fg">{session.restaurantName || 'New bill'}</p>
                          <p className="mt-0.5 text-xs text-primary">Setting up people and bill items…</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-primary">{formatCurrency(session.totalAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Outstanding bills */}
            {outstanding.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Outstanding</p>
                  <span className="ml-auto text-right text-[10px] text-fg-faint">
                    {billsNeedingMyAction > 0
                      ? `You have ${billsNeedingMyAction} bill${billsNeedingMyAction === 1 ? '' : 's'} to finish`
                      : 'Waiting for other members'}
                  </span>
                </div>
                <div className="space-y-3">
                  {outstanding.map((session) => (
                    <BillCard
                      key={session.id}
                      session={session}
                      users={users}
                      currentUser={currentUser}
                      billItems={billItems[session.id] ?? []}
                      sessionSelections={selections.filter((s) => s.sessionId === session.id)}
                      splitDataReady={splitDataReady}
                      onClick={() => navigate(`/session/${session.id}`)}
                      onDelete={(() => {
                        const creator = users.find((u) => u.id === session.createdBy)
                        return session.createdBy === currentUser?.id && creator?.role !== 'admin'
                          ? () => setSessionToDelete(session)
                          : undefined
                      })()}
                      variant="outstanding"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed bills */}
            {completed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={12} className="text-success" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Completed</p>
                  <span className="text-[10px] text-fg-faint ml-auto">Visible for 2 days</span>
                </div>
                <div className="space-y-3">
                  {completed.map((session) => (
                    <BillCard
                      key={session.id}
                      session={session}
                      users={users}
                      currentUser={currentUser}
                      billItems={billItems[session.id] ?? []}
                      sessionSelections={selections.filter((s) => s.sessionId === session.id)}
                      splitDataReady={splitDataReady}
                      onClick={() => navigate(`/session/${session.id}`)}
                      onDelete={(() => {
                        const creator = users.find((u) => u.id === session.createdBy)
                        return session.createdBy === currentUser?.id && creator?.role !== 'admin'
                          ? () => setSessionToDelete(session)
                          : undefined
                      })()}
                      variant="completed"
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <Modal
        open={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        title="Delete bill"
        size="sm"
      >
        <p className="text-sm text-fg-muted leading-relaxed">
          Delete <strong className="text-fg">{sessionToDelete?.restaurantName || 'this bill'}</strong> and all its items and selections? This cannot be undone.
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setSessionToDelete(null)}
            disabled={deleting}
            className="min-h-11 flex-1 rounded-xl border border-line py-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-overlay disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!sessionToDelete) return
              setDeleting(true)
              try {
                await deleteSession(sessionToDelete.id)
                toast.info('Bill deleted')
                setSessionToDelete(null)
              } catch {
                toast.error('Could not delete the bill')
              } finally {
                setDeleting(false)
              }
            }}
            disabled={deleting}
            className="min-h-11 flex-1 rounded-xl border border-danger/30 bg-danger/15 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/25 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete bill'}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}

// ── Bill card ──────────────────────────────────────────────────────

function BillCard({
  session, users, currentUser, billItems, sessionSelections, splitDataReady, onClick, onDelete, variant,
}: {
  session: Session
  users: User[]
  currentUser: User | null
  billItems: import('../types').BillItem[]
  sessionSelections: import('../types').ItemSelection[]
  splitDataReady: boolean
  onClick: () => void
  onDelete?: () => void
  variant: 'outstanding' | 'completed'
}) {
  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const lockedIds = session.lockedParticipantIds ?? []
  const participantDone = (uid: string) => isParticipantDone(session, uid)
  const doneCount = participants.filter((p) => participantDone(p.id)).length
  const allLocked = participants.length > 0 && doneCount === participants.length
  const iMeLocked = participantDone(currentUser?.id ?? '')

  const splits = computeSplits(
    billItems,
    sessionSelections,
    participants,
    session.cgst,
    session.sgst,
    lockedIds,
    session.totalAmount,
  )
  const mySplit = splits.find((s) => s.userId === currentUser?.id)

  // Time remaining for completed bills
  let timeLeft = ''
  if (variant === 'completed' && session.completedAt) {
    const expiry = new Date(session.completedAt).getTime() + 2 * 24 * 60 * 60 * 1000
    const msLeft = expiry - Date.now()
    if (msLeft > 0) {
      const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60))
      timeLeft = hoursLeft >= 24
        ? `${Math.ceil(hoursLeft / 24)}d left`
        : `${hoursLeft}h left`
    }
  }

  return (
    <article
      className={clsx(
        'card-lift group w-full overflow-hidden rounded-2xl border text-left shadow-sm hover:shadow-card',
        variant === 'outstanding'
          ? 'bg-surface border-line hover:border-warning/40'
          : 'bg-surface/60 border-line/60 hover:border-success/40',
      )}
    >
      <button type="button" onClick={onClick} className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            variant === 'outstanding'
              ? 'bg-warning/15 border border-warning/30'
              : 'bg-success/15 border border-success/30',
          )}>
            {variant === 'outstanding'
              ? <Clock size={14} className="text-warning" />
              : <CheckCircle size={14} className="text-success" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg truncate">
              {session.restaurantName || 'Unnamed Bill'}
            </p>
            <p className="text-xs text-fg-subtle mt-0.5 font-mono">{session.orderId} · {session.date}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {variant === 'completed' && splitDataReady ? (
            <>
              <p className="text-base font-bold text-success">
                {formatCurrency(mySplit?.grandTotal ?? 0)}
              </p>
              <p className="text-[10px] text-fg-subtle mt-0.5">your share</p>
            </>
          ) : variant === 'completed' ? (
            <p className="text-xs text-fg-subtle flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin text-primary" /> Calculating…
            </p>
          ) : (
            <>
              <p className="text-sm font-bold text-fg-muted">{formatCurrency(session.totalAmount)}</p>
              <p className="text-[10px] text-fg-faint mt-0.5">total bill</p>
            </>
          )}
        </div>
      </div>

      {/* Member indicators */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {participants.map((p, i) => {
          const locked = lockedIds.includes(p.id)
          const done = participantDone(p.id)
          const isMe = p.id === currentUser?.id
          return (
            <div
              key={p.id}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-[color,background-color,border-color] duration-150',
                done
                  ? 'bg-success/10 border-success/25 text-success'
                  : 'bg-warning/10 border-warning/25 text-warning',
              )}
            >
              <div className={clsx(
                'w-4 h-4 rounded-full bg-gradient-to-br flex items-center justify-center text-[8px] font-bold text-white shrink-0',
                avatarStyles[i % avatarStyles.length],
              )}>
                {p.name[0]?.toUpperCase()}
              </div>
              <span>{isMe ? 'You' : p.name.split(' ')[0]}</span>
              {locked ? <Lock size={7} /> : <Clock size={7} className="opacity-60" />}
            </div>
          )
        })}
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-1.5">
          {variant === 'completed' ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle size={10} /> All locked · final split ready
            </span>
          ) : allLocked ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle size={10} /> All locked · review item portions
            </span>
          ) : iMeLocked ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle size={10} /> You're done · waiting for {participants.length - doneCount} more
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-warning">
              <Clock size={10} /> Choose your items →
            </span>
          )}
        </div>
        {timeLeft && (
          <span className="text-[10px] text-fg-faint bg-surface-overlay border border-line rounded-full px-2 py-0.5">
            {timeLeft}
          </span>
        )}
      </div>
      </button>
      {onDelete && (
        <div className="flex min-h-11 items-center justify-between border-t border-line/60 bg-canvas/30 px-4 py-1.5">
          <span className="text-[10px] text-fg-faint">Created by you</span>
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs text-fg-faint transition-[color,background-color] duration-150 hover:bg-danger/10 hover:text-danger"
            title="Delete this bill"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </article>
  )
}
