import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Users, Loader2, AlertCircle, UserRoundPlus, ChevronRight,
  KeyRound, ArrowLeft, PartyPopper,
} from 'lucide-react'
import { dbGetGroupByCode, dbGetUsers, dbCreateUser } from '../lib/db'
import { useAppStore } from '../store/appStore'
import { PinPad } from '../components/auth/PinPad'
import { ThemeToggle } from '../components/shared/ThemeToggle'
import { playDoorTransition } from '../components/shared/DoorTransition'
import { toast } from '../components/shared/Toast'
import { hashPin, generateId } from '../services/calculations'
import type { Group, User } from '../types'
import clsx from 'clsx'

const avatarStyles = [
  'from-orange-300 to-rose-500',
  'from-sky-300 to-blue-600',
  'from-emerald-300 to-teal-600',
  'from-violet-300 to-purple-600',
  'from-amber-200 to-orange-500',
  'from-pink-300 to-fuchsia-600',
]

type Stage = 'loading' | 'notfound' | 'error' | 'welcome' | 'pin' | 'newProfile'

export function JoinGroupPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { setActiveGroup, setCurrentUser, requirePin, rememberGroup } = useAppStore()

  const [stage, setStage] = useState<Stage>('loading')
  const [errorText, setErrorText] = useState('')
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pinError, setPinError] = useState('')

  // New-profile form
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!code) { setStage('notfound'); return }
      try {
        const found = await dbGetGroupByCode(code.toLowerCase())
        if (cancelled) return
        if (!found) { setStage('notfound'); return }
        setGroup(found)
        const groupUsers = await dbGetUsers(found.id)
        if (cancelled) return
        setMembers(groupUsers)
        setStage('welcome')
      } catch (error) {
        if (cancelled) return
        setErrorText(error instanceof Error ? error.message : 'The invite could not be opened')
        setStage('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [code])

  const enterGroupAs = (user: User) => {
    if (!group) return
    rememberGroup(group)    // shows up as tap-to-enter on the welcome gate next time
    setActiveGroup(group)   // scope the whole app to this group
    setCurrentUser(user)    // after setActiveGroup — it clears the current user
    playDoorTransition(() => navigate(user.role === 'admin' ? '/admin' : '/user'))
  }

  const pickMember = (user: User) => {
    setPinError('')
    if (!requirePin && user.role !== 'admin') {
      enterGroupAs(user)
      return
    }
    setSelectedUser(user)
    setStage('pin')
  }

  const handlePinComplete = (pin: string) => {
    if (!selectedUser) return
    if (hashPin(pin) === selectedUser.pin) {
      enterGroupAs(selectedUser)
    } else {
      setPinError('Incorrect PIN')
    }
  }

  const handleCreateProfile = async () => {
    if (!group) return
    const name = newName.trim()
    if (!name) { toast.error('Enter your name'); return }
    if (newPin.length !== 4) { toast.error('Choose a 4-digit PIN'); return }
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      toast.error('That name is already in this group — tap your profile instead')
      return
    }
    setJoining(true)
    try {
      const user: User = {
        id: generateId(),
        name,
        pin: hashPin(newPin),
        role: 'user',
        groupId: group.id,
        createdAt: new Date().toISOString(),
      }
      await dbCreateUser(user)
      toast.success(`Welcome to ${group.name}!`)
      enterGroupAs(user)
    } catch {
      toast.error('Your profile could not be created — try again')
      setJoining(false)
    }
  }

  const regularMembers = members.filter((m) => m.role === 'user')

  return (
    <div className="flex h-[100dvh] min-h-[100svh] flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft size={14} /> BillWise
        </button>
        <ThemeToggle />
      </div>

      <main className="flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto py-8">
        <div className="w-full max-w-md">
          {stage === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-24 animate-fade-in" role="status" aria-label="Opening invite">
              <div className="skeleton h-16 w-16 rounded-2xl" />
              <div className="skeleton h-5 w-48 rounded-lg" />
              <div className="skeleton h-3 w-64 rounded-lg" />
              <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
                <Loader2 size={13} className="animate-spin text-primary" /> Opening your invite…
              </p>
            </div>
          )}

          {(stage === 'notfound' || stage === 'error') && (
            <div className="mx-auto max-w-sm rounded-3xl border border-danger/20 bg-danger/5 px-6 py-10 text-center animate-slide-up">
              <AlertCircle size={26} className="mx-auto mb-3 text-danger" />
              <p className="text-sm font-semibold text-fg">
                {stage === 'notfound' ? 'This invite link is not valid' : 'The invite could not be opened'}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">
                {stage === 'notfound'
                  ? 'Double-check the link with the person who shared it — it may have been retyped incorrectly.'
                  : errorText}
              </p>
              <button
                onClick={() => navigate('/')}
                className="mt-5 min-h-11 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-raised"
              >
                Go to BillWise
              </button>
            </div>
          )}

          {stage === 'welcome' && group && (
            <div className="text-center animate-list">
              <div className="anim-select mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-primary shadow-glow">
                <PartyPopper size={28} />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">You're invited</p>
              <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{group.name}</h1>
              <p className="mt-2 text-sm text-fg-subtle">
                {regularMembers.length > 0
                  ? 'Tap your profile to jump in — or create one.'
                  : 'Be the first to join this group.'}
              </p>

              {regularMembers.length > 0 && (
                <div className="mt-8 space-y-2 text-left">
                  {regularMembers.map((member, i) => (
                    <button
                      key={member.id}
                      onClick={() => pickMember(member)}
                      className="group flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-[border-color,background-color,transform] duration-150 hover:border-primary/40 hover:bg-surface-raised/60 active:scale-[0.99]"
                    >
                      <div className={clsx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-bold text-white',
                        avatarStyles[i % avatarStyles.length],
                      )}>
                        {member.name[0]?.toUpperCase()}
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-fg">{member.name}</span>
                      <ChevronRight size={15} className="text-fg-faint transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => { setStage('newProfile'); setPinError('') }}
                className={clsx(
                  'mt-4 flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3.5 transition-[border-color,background-color,transform] duration-150 active:scale-[0.99]',
                  regularMembers.length > 0
                    ? 'border border-dashed border-line text-fg-subtle hover:border-primary/40 hover:text-fg'
                    : 'btn-sheen justify-center bg-primary font-semibold text-primary-fg shadow-glow hover:bg-primary-hover',
                )}
              >
                <UserRoundPlus size={16} className={regularMembers.length > 0 ? '' : 'shrink-0'} />
                <span className="text-sm">{regularMembers.length > 0 ? "I'm new — create my profile" : 'Create my profile'}</span>
              </button>

              <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-fg-faint">
                <Users size={11} />
                {members.length} member{members.length === 1 ? '' : 's'} · Registered to {group.ownerEmail}
              </p>
            </div>
          )}

          {stage === 'pin' && selectedUser && (
            <div className="w-full animate-slide-up">
              <button
                onClick={() => { setStage('welcome'); setSelectedUser(null); setPinError('') }}
                className="mb-8 flex items-center gap-1.5 text-xs text-fg-subtle transition-colors hover:text-fg"
              >
                <ArrowLeft size={14} /> Back to {group?.name}
              </button>
              <div className="mb-7 text-center">
                <div className={clsx(
                  'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-card',
                  avatarStyles[Math.max(0, regularMembers.findIndex((m) => m.id === selectedUser.id)) % avatarStyles.length],
                )}>
                  <span className="text-2xl font-bold text-white">{selectedUser.name[0]?.toUpperCase()}</span>
                </div>
                <p className="text-base font-semibold text-fg">{selectedUser.name}</p>
                <p className="mt-1 text-xs text-fg-subtle">Enter your 4-digit PIN</p>
              </div>
              <PinPad onComplete={handlePinComplete} error={pinError} maxLength={4} />
            </div>
          )}

          {stage === 'newProfile' && group && (
            <div className="w-full animate-slide-up">
              <button
                onClick={() => setStage('welcome')}
                className="mb-8 flex items-center gap-1.5 text-xs text-fg-subtle transition-colors hover:text-fg"
              >
                <ArrowLeft size={14} /> Back to {group.name}
              </button>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                  <UserRoundPlus size={22} />
                </div>
                <p className="text-base font-semibold text-fg">Create your profile</p>
                <p className="mt-1 text-xs text-fg-subtle">This is how you'll appear in {group.name}</p>
              </div>
              <div className="space-y-3">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Your name"
                  className="min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
                />
                <div className="relative">
                  <KeyRound size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Choose a 4-digit PIN"
                    className="min-h-11 w-full rounded-xl border border-line bg-surface-raised py-3 pl-10 pr-4 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleCreateProfile}
                  disabled={joining}
                  className="btn-sheen flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-fg shadow-glow transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
                >
                  {joining
                    ? <><Loader2 size={15} className="animate-spin" /> Joining…</>
                    : <>Join {group.name} →</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
