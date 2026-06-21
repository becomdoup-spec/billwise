import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, Lock, Sparkles, Loader2 } from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { useAppStore } from '../store/appStore'
import { formatCurrency, computeSplits } from '../services/calculations'
import clsx from 'clsx'

export function UserDashboard() {
  const navigate = useNavigate()
  const {
    sessions,
    users,
    billItems,
    selections,
    currentUser,
    cloudReady,
    cloudSyncError,
    selectionsReady,
  } = useAppStore()
  const splitDataReady = cloudReady && selectionsReady && !cloudSyncError

  // Only show sessions that are public AND user is a participant
  const mySessions = sessions.filter(
    (s) => s.isPublic && s.participantIds.includes(currentUser?.id ?? ''),
  )

  return (
    <Layout>
      <Header title="My Bills" subtitle={currentUser?.name} showLogout />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mySessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400">No active bills</p>
            <p className="text-xs text-zinc-600 mt-1">Your admin hasn't shared any bills with you yet</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Your sessions</p>
            {mySessions.map((session) => {
              const items = billItems[session.id] ?? []
              const participants = users.filter((u) => session.participantIds.includes(u.id))
              const sessionSels = selections.filter((s) => s.sessionId === session.id)
              const splits = computeSplits(
                items,
                sessionSels,
                participants,
                session.cgst,
                session.sgst,
                session.lockedParticipantIds,
                session.totalAmount,
              )
              const mySplit = splits.find((s) => s.userId === currentUser?.id)

              const iMeLocked = (session.lockedParticipantIds ?? []).includes(currentUser?.id ?? '')
              const isSessionClosed = session.status === 'completed'

              // Per-participant lock status
              const lockStatus = participants.map((p) => {
                const locked = (session.lockedParticipantIds ?? []).includes(p.id)
                return { user: p, locked }
              })
              const lockedCount = lockStatus.filter((x) => x.locked).length
              const allLocked = participants.length > 0 && lockedCount === participants.length

              return (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="w-full bg-surface-1 border border-border hover:border-border-light rounded-2xl p-4 text-left transition-all group"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {session.restaurantName || 'Unnamed Bill'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 font-mono">{session.orderId} · {session.date}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {allLocked && splitDataReady ? (
                        <>
                          <p className="text-base font-bold text-brand">
                            {formatCurrency(mySplit?.grandTotal ?? 0)}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">your final share</p>
                        </>
                      ) : allLocked ? (
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Loader2 size={11} className="animate-spin text-brand" /> Calculating…
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500">Split pending</p>
                      )}
                    </div>
                  </div>

                  {/* Live lock status row */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {lockStatus.map(({ user, locked }) => (
                      <div
                        key={user.id}
                        className={clsx(
                          'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                          locked
                            ? 'bg-green-500/10 border-green-500/25 text-green-400'
                            : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400',
                        )}
                      >
                        <div className={clsx(
                          'w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold',
                          locked ? 'bg-green-500/30 text-green-300' : 'bg-yellow-500/20 text-yellow-300',
                        )}>
                          {user.name[0]?.toUpperCase()}
                        </div>
                        <span>{user.id === currentUser?.id ? 'You' : user.name.split(' ')[0]}</span>
                        <span className="opacity-70">· {locked ? 'Done' : 'Pending'}</span>
                        {locked
                          ? <Lock size={7} />
                          : <Clock size={7} className="opacity-60" />}
                      </div>
                    ))}
                  </div>

                  {/* Status line */}
                  <div className="flex items-center gap-2">
                    {isSessionClosed ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <Lock size={10} /> Session closed
                      </span>
                    ) : allLocked && splitDataReady ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle size={10} /> All locked — final split ready
                      </span>
                    ) : allLocked ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Loader2 size={10} className="animate-spin text-brand" /> Loading final split…
                      </span>
                    ) : iMeLocked ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle size={10} /> You're locked · waiting for {participants.length - lockedCount} more
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <Clock size={10} /> Choose your items →
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>
    </Layout>
  )
}
