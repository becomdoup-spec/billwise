import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, UserPlus, X, Loader2 } from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { Header } from '../components/shared/Header'
import { BillUpload } from '../components/admin/BillUpload'
import { useAppStore } from '../store/appStore'
import type { ParsedBill } from '../types'
import { generateId } from '../services/calculations'
import { toast } from '../components/shared/Toast'
import clsx from 'clsx'

type Step = 'upload' | 'participants'

export function NewSessionPage() {
  const navigate = useNavigate()
  const {
    currentUser, users, createSession, addParticipant, setBillItems,
    saveBillImage, addUser, updateSession, deleteSession,
  } = useAppStore()
  const [step, setStep] = useState<Step>('upload')
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPin, setNewMemberPin] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const regularUsers = users.filter((u) => u.role === 'user')

  const handleBillParsed = (bill: ParsedBill, image?: string) => {
    setParsedBill(bill)
    setImageDataUrl(image ?? '')
    setStep('participants')
  }

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleCreate = async () => {
    if (!parsedBill) return
    if (selectedUserIds.length === 0) {
      toast.error('Add at least one participant')
      return
    }
    if (isCreating) return

    setIsCreating(true)
    let createdSessionId = ''
    try {
      const session = await createSession({
        restaurantName: parsedBill.restaurantName,
        date: parsedBill.date,
        billImageBase64: imageDataUrl,
        isPublic: false,
        subtotal: parsedBill.subtotal,
        cgst: parsedBill.cgst,
        sgst: parsedBill.sgst,
        totalAmount: parsedBill.totalAmount,
        createdBy: currentUser?.id ?? '',
      })
      createdSessionId = session.id

      await Promise.all(selectedUserIds.map((uid) => addParticipant(session.id, uid)))

      const billItems = parsedBill.items.map((item) => ({
        ...item,
        id: generateId(),
        sessionId: session.id,
      }))
      await setBillItems(session.id, billItems)
      if (imageDataUrl) await saveBillImage(session.id, imageDataUrl)
      await updateSession(session.id, { isPublic: true })

      toast.success(`Session created — ${session.orderId}`)
      navigate(`/session/${session.id}`)
    } catch {
      if (createdSessionId) {
        deleteSession(createdSessionId).catch(() => undefined)
      }
      toast.error('Session could not be saved. Check the Supabase connection and try again.')
      setIsCreating(false)
    }
  }

  return (
    <Layout>
      <Header title="New Session" back showExit />

      {/* Progress steps */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        {(['upload', 'participants'] as const).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            {idx > 0 && <div className="w-6 h-px bg-line-strong" />}
            <div className={clsx(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-all',
              step === s
                ? 'bg-primary/20 border-primary/40 text-primary'
                : s === 'participants' && step === 'participants'
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'bg-transparent border-line text-fg-subtle',
            )}>
              <span className={clsx(
                'w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold',
                step === s ? 'bg-primary text-primary-fg' : 'bg-surface-overlay text-fg-subtle',
              )}>
                {step === 'participants' && s === 'upload' ? <Check size={10} /> : idx + 1}
              </span>
              {s === 'upload' ? 'Bill' : 'People'}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {step === 'upload' && (
          <div className="animate-fade-in">
            <p className="text-sm text-fg-muted mb-4">
              Upload a photo of your bill — AI will extract, format, and validate every item and price automatically.
            </p>
            <BillUpload onParsed={handleBillParsed} />
          </div>
        )}

        {step === 'participants' && (
          <div className="animate-slide-up space-y-4">
            <div>
              <p className="text-sm font-semibold text-fg mb-1">Who joined?</p>
              <p className="text-xs text-fg-subtle">Select everyone at the table. They'll pick their items.</p>
            </div>

            <div className="space-y-2 animate-list">
              {regularUsers.map((user) => {
                const selected = selectedUserIds.includes(user.id)
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
                      selected
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-surface border-line hover:border-line-strong',
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                      selected ? 'bg-primary/25 text-primary' : 'bg-surface-overlay text-fg-muted',
                    )}>
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 text-left text-sm font-medium text-fg">{user.name}</span>
                    <div className={clsx(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                      selected ? 'bg-primary border-primary' : 'border-line-strong',
                    )}>
                      {selected && <Check size={10} strokeWidth={3} className="text-primary-fg" />}
                    </div>
                  </button>
                )
              })}

              {/* Inline add member */}
              {currentUser?.role === 'admin' && showAddMember ? (
                <div className="bg-surface border border-primary/30 rounded-xl px-4 py-3 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-fg-muted">Add member</p>
                    <button onClick={() => { setShowAddMember(false); setNewMemberName(''); setNewMemberPin('') }} className="text-fg-subtle hover:text-fg">
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    autoFocus
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Name"
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/60"
                  />
                  <input
                    value={newMemberPin}
                    onChange={(e) => setNewMemberPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit PIN"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/60"
                  />
                  <button
                    onClick={async () => {
                      const name = newMemberName.trim()
                      if (!name) { toast.error('Enter a name'); return }
                      if (newMemberPin.length !== 4) { toast.error('PIN must be 4 digits'); return }
                      try {
                        const newUser = await addUser(name, newMemberPin, 'user')
                        setSelectedUserIds((prev) => [...prev, newUser.id])
                        setNewMemberName('')
                        setNewMemberPin('')
                        setShowAddMember(false)
                        toast.success(`${name} added`)
                      } catch {
                        toast.error('Member could not be saved')
                      }
                    }}
                    className="w-full py-2 bg-primary hover:bg-primary-hover rounded-lg text-sm font-semibold text-primary-fg transition-all"
                  >
                    Add & Select
                  </button>
                </div>
              ) : currentUser?.role === 'admin' ? (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="w-full flex items-center gap-2 rounded-xl border border-dashed border-line hover:border-primary/30 px-4 py-3 transition-all text-fg-subtle hover:text-fg-muted"
                >
                  <UserPlus size={14} />
                  <span className="text-sm">Add new member</span>
                </button>
              ) : null}
            </div>

            {selectedUserIds.length > 0 && (
              <div className="flex items-center gap-2 bg-surface rounded-xl border border-line px-4 py-3">
                <span className="text-xs text-fg-subtle flex-1">
                  {selectedUserIds.length} participant{selectedUserIds.length > 1 ? 's' : ''} · GST split equally
                </span>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={selectedUserIds.length === 0 || isCreating}
              className="w-full py-3.5 bg-primary hover:bg-primary-hover btn-sheen shadow-glow disabled:shadow-none disabled:bg-surface-overlay disabled:text-fg-faint rounded-xl text-sm font-semibold text-primary-fg transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              {isCreating
                ? <><Loader2 size={15} className="animate-spin" /> Creating session…</>
                : 'Create Session →'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
