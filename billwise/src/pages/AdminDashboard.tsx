import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Users, Receipt, Settings, ChevronRight, Clock,
  CheckCircle, Sparkles, Eye, EyeOff, Trash2, ShieldCheck, ShieldOff,
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

  const togglePublic = async (session: Session) => {
    try {
      await updateSession(session.id, { isPublic: !session.isPublic })
    } catch {
      toast.error('Session visibility could not be saved')
    }
  }

  return (
    <Layout>
      <Header title="BillWise Admin" subtitle={currentUser?.name} showLogout />

      {/* Tabs */}
      <div className="flex border-b border-line px-4 gap-1 pt-1">
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
              tab === id ? 'text-primary border-primary' : 'text-fg-subtle border-transparent hover:text-fg-muted',
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
              className="card-lift w-full flex items-center justify-between bg-primary/10 border border-primary/25 hover:border-primary/50 rounded-2xl px-5 py-4 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                  <Plus size={18} className="text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-fg">New Session</p>
                  <p className="text-xs text-fg-subtle mt-0.5">Upload a bill to split</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-fg-subtle group-hover:text-fg-muted transition-colors" />
            </button>

            {/* Active sessions */}
            {active.length > 0 && (
              <section>
                <p className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-2">Active</p>
                <div className="space-y-2 animate-list">
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
                <p className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-2">Completed</p>
                <div className="space-y-2 animate-list">
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
                <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-line flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} className="text-fg-faint" />
                </div>
                <p className="text-sm font-medium text-fg-muted">No sessions yet</p>
                <p className="text-xs text-fg-faint mt-1">Create one by uploading a bill</p>
              </div>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="p-4"><UserManager /></div>
        )}

        {tab === 'settings' && (
          <div className="p-4 space-y-4">
            <PinRequirementToggle />
            <div className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Bill OCR</p>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-success mt-1.5 shrink-0" />
                  <p className="text-xs text-fg-muted leading-relaxed">
                    Bills are read using <span className="text-fg">Tesseract OCR</span> — runs entirely on your device.
                    No internet connection, no API key, and no data ever leaves your phone or browser.
                  </p>
                </div>
              </div>
            </div>
            <AdminPasswordSettings />
            <div className="bg-surface rounded-2xl border border-line p-4">
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">App Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Version</span>
                  <span className="text-fg-muted">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Sessions</span>
                  <span className="text-fg-muted">{sessions.length}</span>
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
        <p className="text-sm text-fg-muted leading-relaxed">
          Delete <strong className="text-fg">{sessionToDelete?.restaurantName || 'this session'}</strong> and all of its bill items and selections? This cannot be undone.
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setSessionToDelete(null)}
            className="flex-1 py-2.5 rounded-xl border border-line text-sm text-fg-muted hover:bg-surface-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!sessionToDelete) return
              try {
                await deleteSession(sessionToDelete.id)
                toast.info('Session deleted')
                setSessionToDelete(null)
              } catch {
                toast.error('Session could not be deleted from the database')
              }
            }}
            className="flex-1 py-2.5 rounded-xl bg-danger/15 border border-danger/30 text-sm font-medium text-danger hover:bg-danger/25 transition-colors"
          >
            Delete session
          </button>
        </div>
      </Modal>
    </Layout>
  )
}

function PinRequirementToggle() {
  const { requirePin, setRequirePin } = useAppStore()
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    setSaving(true)
    try {
      await setRequirePin(!requirePin)
      toast.success(requirePin ? 'PIN login disabled — members tap to enter directly' : 'PIN login enabled')
    } catch {
      toast.error('Could not save setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Security · Member Login</p>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${requirePin ? 'bg-primary/15 border border-primary/30' : 'bg-surface-overlay border border-line'}`}>
              {requirePin
                ? <ShieldCheck size={16} className="text-primary" />
                : <ShieldOff size={16} className="text-fg-subtle" />}
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Require PIN to login</p>
              <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
                {requirePin
                  ? 'Members must enter their 4-digit PIN when logging in.'
                  : 'Members tap their profile to enter directly — no PIN needed.'}
              </p>
            </div>
          </div>
          {/* Toggle switch */}
          <button
            onClick={toggle}
            disabled={saving}
            aria-label={requirePin ? 'Disable PIN requirement' : 'Enable PIN requirement'}
            className={`relative shrink-0 w-11 h-6 rounded-full border-2 transition-all duration-200 ${
              requirePin
                ? 'bg-primary border-primary'
                : 'bg-surface-overlay border-line'
            } disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${
              requirePin ? 'left-[calc(100%-1.125rem)]' : 'left-0.5'
            }`} />
          </button>
        </div>
        <p className="text-[10px] text-fg-faint mt-3 pl-12">
          Admin login always requires a PIN regardless of this setting.
        </p>
      </div>
    </div>
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
      className="w-full bg-surface-raised border border-line rounded-xl px-4 py-3 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/60 font-mono tracking-widest"
    />
  )

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Security · My Admin PIN</p>
      </div>
      <div className="p-4 space-y-3">
        {pinInput(currentPin, setCurrentPin, 'Current PIN')}
        {pinInput(newPin, setNewPin, 'New 4-digit PIN')}
        {pinInput(confirmPin, setConfirmPin, 'Confirm new PIN')}
        <button
          onClick={updatePin}
          disabled={saving}
          className="w-full py-3 bg-primary hover:bg-primary-hover btn-sheen shadow-glow disabled:shadow-none disabled:opacity-60 rounded-xl text-sm font-semibold text-primary-fg transition-all"
        >
          {saving ? 'Saving…' : 'Update My PIN'}
        </button>
        <p className="text-xs text-fg-faint">Other admin and member PINs can be reset from the Members tab.</p>
      </div>
    </div>
  )
}

// ── Admin session card with visibility toggle ──────────────────

const statusConfig = {
  active: { icon: Clock, label: 'Active', className: 'text-warning' },
  locked: { icon: Clock, label: 'Active', className: 'text-warning' },
  completed: { icon: CheckCircle, label: 'Done', className: 'text-success' },
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
    <div className="card-lift bg-surface border border-line hover:border-primary/40 rounded-xl overflow-hidden shadow-sm hover:shadow-card">
      {/* Main row — clickable */}
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-raised/50 transition-all group"
      >
        <div className="w-9 h-9 rounded-lg bg-surface-overlay border border-line flex items-center justify-center shrink-0">
          <Receipt size={16} className="text-fg-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{session.restaurantName || 'Unnamed Bill'}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <StatusIcon size={11} className={cfg.className} />
            <span className={`text-xs ${cfg.className}`}>{cfg.label}</span>
            <span className="text-xs text-fg-faint">·</span>
            <span className="text-xs text-fg-subtle font-mono">{session.orderId}</span>
            <span className="text-xs text-fg-faint">·</span>
            <span className="text-xs text-fg-subtle">{session.date}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary">{formatCurrency(session.totalAmount)}</p>
          <p className="text-xs text-fg-subtle mt-0.5">{session.participantIds.length} people</p>
        </div>
        <ChevronRight size={14} className="text-fg-faint group-hover:text-fg-muted transition-colors shrink-0" />
      </button>

      {/* Footer bar — lock progress + visibility toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-line/60 bg-canvas/40">
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
                          ? 'bg-success/20 border-success/50 text-success'
                          : 'bg-warning/10 border-warning/40 text-warning',
                      )}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>
                  )
                })}
              </div>
              {allLocked ? (
                <span className="text-[10px] text-success font-medium">All locked ✓</span>
              ) : (
                <span className="text-[10px] text-warning">{lockedCount}/{participants.length} done</span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-fg-faint">No participants</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-transparent text-fg-faint hover:text-danger hover:border-danger/25 hover:bg-danger/10 transition-all"
            title="Delete session"
          >
            <Trash2 size={10} /> Delete
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePublic() }}
            className={clsx(
              'flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all',
              session.isPublic
                ? 'bg-primary/15 border-primary/35 text-primary'
                : 'bg-surface-overlay border-line text-fg-subtle hover:text-fg-muted',
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
