import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, ReceiptText, UserRound } from 'lucide-react'
import { PinPad } from '../components/auth/PinPad'
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
    <div className="min-h-screen bg-surface-0 flex flex-col px-6 py-8 sm:py-12">
      <div className="w-full max-w-5xl mx-auto">
        <button
          onClick={openAdminAccess}
          className="group inline-flex items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
          aria-label="Open admin access"
          title="Admin access"
        >
          <span className="relative w-10 h-11 rounded-lg bg-brand text-surface-0 flex items-center justify-center shadow-[0_8px_28px_rgba(212,149,106,0.2)] transition-transform group-hover:-translate-y-0.5">
            <ReceiptText size={22} strokeWidth={2.2} />
            <span className="absolute -bottom-1 left-1.5 w-2 h-2 bg-brand rotate-45" />
          </span>
          <span className="text-2xl font-bold text-white tracking-tight">BillWise</span>
        </button>
      </div>

      <main className="flex-1 flex items-center justify-center w-full py-10">
        {step === 'profiles' ? (
          <div className="w-full max-w-4xl text-center animate-fade-in">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand mb-3">Shared moments. Fair splits.</p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white">Who&apos;s in the mix?</h1>
            <p className="text-sm sm:text-base text-zinc-500 mt-3">Claim yours &amp; Join the tally</p>

            {!cloudReady ? (
              <div className="mt-12 flex items-center justify-center gap-2 text-sm text-zinc-500">
                <Loader2 size={16} className="animate-spin text-brand" /> Loading live profiles…
              </div>
            ) : cloudSyncError ? (
              <div className="mt-12 mx-auto max-w-sm rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-6">
                <AlertCircle size={22} className="text-red-400 mx-auto mb-3" />
                <p className="text-sm text-red-300">Live profiles could not be loaded</p>
                <p className="text-xs text-zinc-500 mt-1">Check this deployment's Supabase environment variables and connection.</p>
              </div>
            ) : regularUsers.length > 0 ? (
              <div className="mt-10 sm:mt-14 flex flex-wrap justify-center gap-x-5 gap-y-8 sm:gap-x-8">
                {regularUsers.map((user, index) => (
                  <button
                    key={user.id}
                    onClick={() => selectMember(user.id)}
                    className="group w-28 sm:w-36 focus:outline-none"
                  >
                    <span className={clsx(
                      'aspect-square w-full rounded-2xl bg-gradient-to-br flex items-center justify-center border-2 border-transparent shadow-xl transition-all duration-200',
                      'group-hover:scale-105 group-hover:border-white group-focus-visible:border-brand group-focus-visible:scale-105',
                      avatarStyles[index % avatarStyles.length],
                    )}>
                      <span className="text-4xl sm:text-5xl font-bold text-white/95 drop-shadow-md">
                        {user.name.trim().charAt(0).toUpperCase()}
                      </span>
                    </span>
                    <span className="block mt-3 text-sm sm:text-base text-zinc-400 truncate transition-colors group-hover:text-white">
                      {user.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-12 mx-auto max-w-sm rounded-2xl border border-border bg-surface-1 px-6 py-10">
                <UserRound size={28} className="text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">No member profiles yet</p>
                <p className="text-xs text-zinc-600 mt-1">An admin can add members from the dashboard.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm animate-slide-up">
            <button
              onClick={() => { setStep('profiles'); setError('') }}
              className="mb-8 text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={14} /> Back to profiles
            </button>

            <div className="text-center mb-7">
              {role === 'user' ? (
                <div className={clsx(
                  'w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-lg',
                  avatarStyles[Math.max(0, regularUsers.findIndex((u) => u.id === selectedUserId)) % avatarStyles.length],
                )}>
                  <span className="text-2xl font-bold text-white">
                    {selectedUser?.name.trim().charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center mx-auto mb-4">
                  <ReceiptText size={25} className="text-brand" />
                </div>
              )}
              <p className="text-base font-semibold text-white">
                {role === 'admin' ? 'Admin access' : selectedUser?.name}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Enter your 4-digit PIN</p>
            </div>

            <PinPad onComplete={handlePinComplete} error={error} maxLength={4} />
          </div>
        )}
      </main>
    </div>
  )
}
