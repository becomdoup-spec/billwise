import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, ArrowRight, Sparkles, Loader2, AlertCircle, X,
  KeyRound, Mail, UserRound, Check, DoorOpen, Database,
} from 'lucide-react'
import { dbFindGroupByInput, dbGetGroupByCode, isGroupsSchemaMissing } from '../../lib/db'
import { useAppStore } from '../../store/appStore'
import { playDoorTransition } from '../shared/DoorTransition'
import { InviteLinkRow } from './InviteLink'
import { toast } from '../shared/Toast'
import type { Group } from '../../types'
import clsx from 'clsx'

/** The home group existing members are migrated into (see SUPABASE_MIGRATION_GROUPS.sql). */
const HOME_GROUP_CODE = 'abcd'

type CreateStage = 'closed' | 'form' | 'created'

export function GroupGate() {
  const navigate = useNavigate()
  const { knownGroups, rememberGroup, forgetGroup, setActiveGroup, createGroup, setLegacyBypass } = useAppStore()

  const [homeGroup, setHomeGroup] = useState<Group | null>(null)
  const [homeGroupLoading, setHomeGroupLoading] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)

  const [codeInput, setCodeInput] = useState('')
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState('')

  const [createStage, setCreateStage] = useState<CreateStage>('closed')
  const [groupName, setGroupName] = useState('')
  const [email, setEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null)

  // Prefill the home group in the background so first-time members
  // see a ready-made "tap to enter" card instead of an empty form.
  useEffect(() => {
    let cancelled = false
    if (knownGroups.length > 0) return
    setHomeGroupLoading(true)
    dbGetGroupByCode(HOME_GROUP_CODE)
      .then((group) => {
        if (cancelled) return
        setHomeGroup(group)
      })
      .catch(() => {
        if (cancelled) return
        setSchemaMissing(isGroupsSchemaMissing())
      })
      .finally(() => {
        if (!cancelled) setHomeGroupLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enterGroup = (group: Group) => {
    playDoorTransition(() => {
      rememberGroup(group)
      setActiveGroup(group)
    })
  }

  const handleEnterByInput = async () => {
    if (entering) return
    const raw = codeInput.trim()
    if (!raw) { setEnterError('Type your group code or name'); return }
    setEntering(true)
    setEnterError('')
    try {
      const group = await dbFindGroupByInput(raw)
      if (!group) {
        setEnterError('No group found — check the code or name and try again.')
        return
      }
      enterGroup(group)
    } catch (error) {
      setEnterError(error instanceof Error ? error.message : 'The group could not be looked up')
      setSchemaMissing(isGroupsSchemaMissing())
    } finally {
      setEntering(false)
    }
  }

  const handleCreate = async () => {
    const name = groupName.trim()
    const mail = email.trim()
    const admin = adminName.trim()
    if (name.length < 2) { toast.error('Give your group a name'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { toast.error('Enter a valid email address'); return }
    if (!admin) { toast.error('Enter your display name'); return }
    if (adminPin.length !== 4) { toast.error('Choose a 4-digit PIN'); return }

    setCreating(true)
    try {
      const { group } = await createGroup(name, mail, admin, adminPin)
      setCreatedGroup(group)
      setCreateStage('created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The group could not be created')
      setSchemaMissing(isGroupsSchemaMissing())
    } finally {
      setCreating(false)
    }
  }

  // Known groups first; the prefetched home group fills in for new devices.
  const quickEntries = knownGroups.length > 0
    ? knownGroups
    : homeGroup
      ? [{ id: homeGroup.id, name: homeGroup.name, inviteCode: homeGroup.inviteCode, lastUsedAt: '' }]
      : []

  const resolveAndEnter = async (inviteCode: string) => {
    if (homeGroup?.inviteCode === inviteCode) { enterGroup(homeGroup); return }
    setEntering(true)
    try {
      const group = await dbGetGroupByCode(inviteCode)
      if (group) enterGroup(group)
      else toast.error('That group no longer exists')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The group could not be opened')
    } finally {
      setEntering(false)
    }
  }

  if (createStage === 'created' && createdGroup) {
    return (
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="anim-select mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-success/30 bg-success/15 text-success">
          <Check size={28} strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">"{createdGroup.name}" is live</h1>
        <p className="mt-2 text-sm text-fg-subtle">
          Your group code is{' '}
          <span className="font-mono font-bold tracking-widest text-primary">{createdGroup.inviteCode.toUpperCase()}</span>
          {' '}— you can always share it from inside the group.
        </p>
        <div className="mt-6 text-left">
          <InviteLinkRow inviteCode={createdGroup.inviteCode} />
        </div>
        <button
          type="button"
          onClick={() => playDoorTransition(() => navigate('/admin'))}
          className="btn-sheen mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-fg shadow-glow transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          <DoorOpen size={16} /> Enter your group
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md animate-list">
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-primary">Welcome to BillWise</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Enter your group</h1>
        <p className="mt-3 text-sm text-fg-subtle">
          Members, bills, and splits live inside your group — like an account for your circle.
        </p>
      </div>

      {/* Tap-to-enter cards (remembered groups, or the prefilled home group) */}
      {homeGroupLoading && quickEntries.length === 0 && (
        <div className="mt-8 space-y-2" role="status" aria-label="Finding your group">
          <div className="skeleton h-[72px] rounded-2xl" />
        </div>
      )}
      {quickEntries.length > 0 && (
        <div className="mt-8 space-y-2">
          {quickEntries.map((entry) => (
            <div key={entry.id} className="group relative">
              <button
                type="button"
                disabled={entering}
                onClick={() => resolveAndEnter(entry.inviteCode)}
                className="card-lift flex min-h-11 w-full items-center gap-3.5 rounded-2xl border border-primary/30 bg-primary/[0.07] px-4 py-4 text-left shadow-glow transition-[border-color,background-color] duration-150 hover:border-primary/60 hover:bg-primary/[0.11] disabled:opacity-60"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-glow">
                  <Users size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">{entry.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    Code <span className="font-mono font-semibold tracking-wider text-primary">{entry.inviteCode.toUpperCase()}</span>
                    <span className="mx-1.5">·</span>Tap to enter
                  </p>
                </div>
                {entering
                  ? <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
                  : <ArrowRight size={16} className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />}
              </button>
              {knownGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => forgetGroup(entry.id)}
                  aria-label={`Forget ${entry.name} on this device`}
                  title="Forget on this device"
                  className="absolute -right-1.5 -top-1.5 hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-raised text-fg-faint shadow-sm transition-colors hover:text-danger group-hover:flex"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Code / name entry */}
      <div className={clsx('mt-6', quickEntries.length > 0 && 'border-t border-line pt-5')}>
        {quickEntries.length > 0 && (
          <p className="mb-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
            or enter another group
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => { setCodeInput(e.target.value); setEnterError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnterByInput() }}
            placeholder="Group code or name"
            autoCapitalize="characters"
            className="min-h-12 w-full flex-1 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleEnterByInput}
            disabled={entering}
            className="flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.97] disabled:opacity-60"
          >
            {entering ? <Loader2 size={15} className="animate-spin" /> : <>Enter <ArrowRight size={14} /></>}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-fg-faint">
          A code like <span className="font-mono font-semibold">ABCD</span>, a pasted invite link, or the group's name all work.
        </p>
        {enterError && (
          <p role="alert" className="mt-2 flex items-center justify-center gap-1.5 text-xs text-danger animate-fade-in">
            <AlertCircle size={12} /> {enterError}
          </p>
        )}
      </div>

      {/* Create a new group */}
      {createStage === 'closed' ? (
        <button
          type="button"
          onClick={() => setCreateStage('form')}
          className="mt-5 flex min-h-11 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5 text-left transition-[border-color,background-color] duration-150 hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-overlay text-fg-muted">
            <Sparkles size={15} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Create a new group</p>
            <p className="mt-0.5 text-[11px] text-fg-subtle">Register with your email — invite people from inside.</p>
          </div>
          <ArrowRight size={14} className="text-fg-faint" />
        </button>
      ) : (
        <div className="mt-5 space-y-3 rounded-2xl border border-line bg-surface p-4 animate-reveal">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">Create a new group</p>
            <button
              type="button"
              onClick={() => setCreateStage('closed')}
              aria-label="Close create group form"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-overlay hover:text-fg"
            >
              <X size={15} />
            </button>
          </div>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle"><Users size={12} /> Group name</span>
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Flat 402, Office lunch crew"
              className="min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle"><Mail size={12} /> Your email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle"><UserRound size={12} /> Your display name</span>
            <input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Shown to your group"
              className="min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle"><KeyRound size={12} /> Choose a 4-digit PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-3 font-mono text-sm tracking-[0.4em] text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="btn-sheen flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-fg transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
          >
            {creating ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <>Create group <ArrowRight size={14} /></>}
          </button>
        </div>
      )}

      {/* Database not upgraded yet — explain + legacy escape hatch */}
      {schemaMissing && (
        <div className="mt-5 space-y-3 rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 animate-reveal">
          <div className="flex items-start gap-2.5">
            <Database size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-warning">
              Groups needs a one-time database upgrade — run <span className="font-mono">SUPABASE_MIGRATION_GROUPS.sql</span> in
              the Supabase SQL editor. Until then you can keep using the classic space.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLegacyBypass(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-raised"
          >
            Continue to the classic space →
          </button>
        </div>
      )}
    </div>
  )
}
