import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Users, Receipt, Settings, ChevronRight, Clock,
  CheckCircle, Sparkles, Eye, EyeOff, Trash2,
} from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { UserManager } from '../components/admin/UserManager'
import { Modal } from '../components/shared/Modal'
import { toast } from '../components/shared/Toast'
import { useAppStore } from '../store/appStore'
import type { Session, User } from '../types'
import { formatCurrency, hashPin } from '../services/calculations'
import clsx from 'clsx'

type Tab = 'sessions' | 'users' | 'settings'

export function AdminDashboard() {
  const navigate = useNavigate()
  const { sessions, currentUser, updateSession, deleteSession, users } = useAppStore()
  const [tab, setTab] = useState<Tab>('sessions')
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)

  const active = sessions.filter((s) => s.status !== 'completed')
  const completed = sessions.filter((s) => s.status === 'completed')

  const togglePublic = (session: Session) => {
    updateSession(session.id, { isPublic: !session.isPublic })
  }

  return (
    <Layout>
      <Header title="BillWise Admin" subtitle={currentUser?.name} showLogout />

      {/* Tabs */}
      <div className="flex border-b border-border px-4 gap-1 pt-1">
        {([
          { id: 'sessions', label: 'Sessions', icon: Receipt },
          { id: 'users', label: 'Members', icon: Users },
          { id: 'settings', label: 'Settings', icon: Settings },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              tab === id ? 'text-brand border-brand' : 'text-zinc-500 border-transparent hover:text-zinc-300',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'sessions' && (
          <div className="p-4 space-y-4">
            {/* New session CTA */}
            <button
              onClick={() => navigate('/admin/new-session')}
              className="w-full flex items-center justify-between bg-brand/10 border border-brand/25 hover:border-brand/50 rounded-2xl px-5 py-4 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center group-hover:bg-brand/30 transition-colors">
                  <Plus size={18} className="text-brand" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">New Session</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Upload a bill to split</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </button>

            {/* Active sessions */}
            {active.length > 0 && (
              <section>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Active</p>
                <div className="space-y-2">
                  {active.map((s) => (
                    <AdminSessionCard
                      key={s.id}
                      session={s}
                      users={users}
                      onClick={() => navigate(`/session/${s.id}`)}
                      onTogglePublic={() => togglePublic(s)}
                      onDelete={() => setSessionToDelete(s)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed sessions */}
            {completed.length > 0 && (
              <section>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Completed</p>
                <div className="space-y-2">
                  {completed.map((s) => (
                    <AdminSessionCard
                      key={s.id}
                      session={s}
                      users={users}
                      onClick={() => navigate(`/session/${s.id}`)}
                      onTogglePublic={() => togglePublic(s)}
                      onDelete={() => setSessionToDelete(s)}
                    />
                  ))}
                </div>
              </section>
            )}

            {sessions.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} className="text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-400">No sessions yet</p>
                <p className="text-xs text-zinc-600 mt-1">Create one by uploading a bill</p>
              </div>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="p-4"><UserManager /></div>
        )}

        {tab === 'settings' && (
          <div className="p-4 space-y-4">
            <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Bill OCR</p>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Bills are read using <span className="text-white">Tesseract OCR</span> — runs entirely on your device.
                    No internet connection, no API key, and no data ever leaves your phone or browser.
                  </p>
                </div>
              </div>
            </div>
            <AdminPasswordSettings />
            <div className="bg-surface-1 rounded-2xl border border-border p-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">App Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Version</span>
                  <span className="text-zinc-300">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Sessions</span>
                  <span className="text-zinc-300">{sessions.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        title="Delete session"
        size="sm"
      >
        <p className="text-sm text-zinc-400 leading-relaxed">
          Delete <strong className="text-white">{sessionToDelete?.restaurantName || 'this session'}</strong> and all of its bill items and selections? This cannot be undone.
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setSessionToDelete(null)}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-zinc-300 hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!sessionToDelete) return
              deleteSession(sessionToDelete.id)
              toast.info('Session deleted')
              setSessionToDelete(null)
            }}
            className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Delete session
          </button>
        </div>
      </Modal>
    </Layout>
  )
}

function AdminPasswordSettings() {
  const { currentUser, updateUserPin } = useAppStore()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)

  const updatePin = async () => {
    if (!currentUser || hashPin(currentPin) !== currentUser.pin) {
      toast.error('Current admin PIN is incorrect')
      return
    }
    if (newPin.length !== 4) {
      toast.error('New PIN must be 4 digits')
      return
    }
    if (newPin !== confirmPin) {
      toast.error('New PINs do not match')
      return
    }
    setSaving(true)
    try {
      await updateUserPin(currentUser.id, newPin)
      setCurrentPin(''); setNewPin(''); setConfirmPin('')
      toast.success('Your admin PIN was updated on every device')
    } catch {
      toast.error('Admin PIN could not be saved to the cloud')
    } finally {
      setSaving(false)
    }
  }

  const pinInput = (value: string, onChange: (value: string) => void, placeholder: string) => (
    <input
      type="password"
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
      placeholder={placeholder}
      className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60 font-mono tracking-widest"
    />
  )

  return (
    <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Security · My Admin PIN</p>
      </div>
      <div className="p-4 space-y-3">
        {pinInput(currentPin, setCurrentPin, 'Current PIN')}
        {pinInput(newPin, setNewPin, 'New 4-digit PIN')}
        {pinInput(confirmPin, setConfirmPin, 'Confirm new PIN')}
        <button
          onClick={updatePin}
          disabled={saving}
          className="w-full py-3 bg-brand hover:bg-brand-light disabled:opacity-60 rounded-xl text-sm font-semibold text-surface-0 transition-all"
        >
          {saving ? 'Saving…' : 'Update My PIN'}
        </button>
        <p className="text-xs text-zinc-600">Other admin and member PINs can be reset from the Members tab.</p>
      </div>
    </div>
  )
}

// ── Admin session card with visibility toggle ──────────────────

const statusConfig = {
  active: { icon: Clock, label: 'Active', className: 'text-yellow-400' },
  locked: { icon: Clock, label: 'Active', className: 'text-yellow-400' },
  completed: { icon: CheckCircle, label: 'Done', className: 'text-green-400' },
}

function AdminSessionCard({
  session, users, onClick, onTogglePublic, onDelete,
}: {
  session: Session
  users: User[]
  onClick: () => void
  onTogglePublic: () => void
  onDelete: () => void
}) {
  const cfg = statusConfig[session.status]
  const StatusIcon = cfg.icon

  const participants = users.filter((u) => session.participantIds.includes(u.id))
  const lockedCount = participants.filter((p) =>
    (session.lockedParticipantIds ?? []).includes(p.id),
  ).length
  const allLocked = participants.length > 0 && lockedCount === participants.length

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Main row — clickable */}
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50 transition-all group"
      >
        <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0">
          <Receipt size={16} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{session.restaurantName || 'Unnamed Bill'}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <StatusIcon size={11} className={cfg.className} />
            <span className={`text-xs ${cfg.className}`}>{cfg.label}</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500 font-mono">{session.orderId}</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">{session.date}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-brand">{formatCurrency(session.totalAmount)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{session.participantIds.length} people</p>
        </div>
        <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
      </button>

      {/* Footer bar — lock progress + visibility toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-surface-0/40">
        {/* Lock progress */}
        <div className="flex items-center gap-2">
          {participants.length > 0 ? (
            <>
              <div className="flex items-center gap-1">
                {participants.map((p) => {
                  const isLocked = (session.lockedParticipantIds ?? []).includes(p.id)
                  return (
                    <div
                      key={p.id}
                      title={`${p.name} — ${isLocked ? 'locked' : 'pending'}`}
                      className={clsx(
                        'w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border',
                        isLocked
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400',
                      )}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>
                  )
                })}
              </div>
              {allLocked ? (
                <span className="text-[10px] text-green-400 font-medium">All locked ✓</span>
              ) : (
                <span className="text-[10px] text-yellow-400">{lockedCount}/{participants.length} done</span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-zinc-600">No participants</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-transparent text-zinc-600 hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/10 transition-all"
            title="Delete session"
          >
            <Trash2 size={10} /> Delete
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePublic() }}
            className={clsx(
              'flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all',
              session.isPublic
                ? 'bg-brand/15 border-brand/35 text-brand'
                : 'bg-surface-3 border-border text-zinc-500 hover:text-zinc-300',
            )}
          >
            {session.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
            {session.isPublic ? 'Visible to users' : 'Hidden'}
          </button>
        </div>
      </div>
    </div>
  )
}
