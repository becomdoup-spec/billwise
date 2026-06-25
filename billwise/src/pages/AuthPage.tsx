import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, ReceiptText, UserRound } from 'lucide-react'
import { PinPad } from '../components/auth/PinPad'
import { HoneycombGrid } from '../components/auth/HoneycombGrid'
import { ThemeToggle } from '../components/shared/ThemeToggle'
import { useAppStore } from '../store/appStore'
import { hashPin } from '../services/calculations'
import clsx from 'clsx'

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

export function AuthPage() {
  const navigate = useNavigate()
  const { users, setCurrentUser, cloudReady, cloudSyncError } = useAppStore()
  const [step, setStep] = useState<Step>('profiles')
  const [role, setRole] = useState<Role>('user')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [error, setError] = useState('')

  const regularUsers = users.filter((u) => u.role === 'user')
  const adminUsers = users.filter((u) => u.role === 'admin')
  const selectedUser = users.find((u) => u.id === selectedUserId)

  const openAdminAccess = () => {
    if (!cloudReady || cloudSyncError) return
    setRole('admin')
    setSelectedUserId(adminUsers[0]?.id ?? '')
    setError('')
    setStep('pin')
  }

  const selectMember = (userId: string) => {
    setRole('user')
    setSelectedUserId(userId)
    setError('')
    setStep('pin')
  }

  const handlePinComplete = (pin: string) => {
    setError('')
    const hashedPin = hashPin(pin)

    if (role === 'admin') {
      const admin = adminUsers.find((u) => u.pin === hashedPin)
      if (admin) {
        setCurrentUser(admin)
        navigate('/admin')
        return
      }
      setError('Incorrect admin PIN')
      return
    }

    const user = regularUsers.find((u) => u.id === selectedUserId && u.pin === hashedPin)
    if (user) {
      setCurrentUser(user)
      navigate('/user')
      return
    }
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
              <div className="mt-8 sm:mt-10 w-full flex justify-center overflow-x-auto">
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
          </div>
        ) : (
          <div className="w-full max-w-sm animate-slide-up">
            <button
              onClick={() => { setStep('profiles'); setError('') }}
              className="mb-8 text-xs text-fg-subtle hover:text-fg transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={14} /> Back to profiles
            </button>

            <div className="text-center mb-7">
              {role === 'user' ? (
                <div className={clsx(
                  'w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-card',
                  avatarStyles[Math.max(0, regularUsers.findIndex((u) => u.id === selectedUserId)) % avatarStyles.length],
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
              <p className="text-xs text-fg-subtle mt-1">Enter your 4-digit PIN</p>
            </div>

            <PinPad onComplete={handlePinComplete} error={error} maxLength={4} />
          </div>
        )}
      </main>
    </div>
  )
}
