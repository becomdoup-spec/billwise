import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, UserPlus, X } from 'lucide-react'
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
  const { currentUser, users, createSession, addParticipant, setBillItems, saveBillImage, addUser } = useAppStore()
  const [step, setStep] = useState<Step>('upload')
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPin, setNewMemberPin] = useState('')

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

    try {
      const session = await createSession({
        restaurantName: parsedBill.restaurantName,
        date: parsedBill.date,
        billImageBase64: imageDataUrl,
        isPublic: true,
        subtotal: parsedBill.subtotal,
        cgst: parsedBill.cgst,
        sgst: parsedBill.sgst,
        totalAmount: parsedBill.totalAmount,
        createdBy: currentUser?.id ?? '',
      })

      await Promise.all(selectedUserIds.map((uid) => addParticipant(session.id, uid)))

      const billItems = parsedBill.items.map((item) => ({
        ...item,
        id: generateId(),
        sessionId: session.id,
      }))
      await setBillItems(session.id, billItems)
      if (imageDataUrl) await saveBillImage(session.id, imageDataUrl)

      toast.success(`Session created — ${session.orderId}`)
      navigate(`/session/${session.id}`)
    } catch {
      toast.error('Session could not be saved. Check the Supabase connection and try again.')
    }
  }

  return (
    <Layout>
      <Header title="New Session" back />

      {/* Progress steps */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {(['upload', 'participants'] as const).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            {idx > 0 && <div className="w-6 h-px bg-border" />}
            <div className={clsx(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-all',
              step === s
                ? 'bg-brand/20 border-brand/40 text-brand'
                : s === 'participants' && step === 'participants'
                  ? 'bg-brand/20 border-brand/40 text-brand'
                  : 'bg-transparent border-border text-zinc-500',
            )}>
              <span className={clsx(
                'w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold',
                step === s ? 'bg-brand text-surface-0' : 'bg-surface-3 text-zinc-500',
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
            <p className="text-sm text-zinc-400 mb-4">
              Upload a photo of your bill — OCR will extract every item and price automatically, right on your device.
            </p>
            <BillUpload onParsed={handleBillParsed} />
          </div>
        )}

        {step === 'participants' && (
          <div className="animate-slide-up space-y-4">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Who joined?</p>
              <p className="text-xs text-zinc-500">Select everyone at the table. They'll pick their items.</p>
            </div>

            <div className="space-y-2">
              {regularUsers.map((user) => {
                const selected = selectedUserIds.includes(user.id)
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
                      selected
                        ? 'bg-brand/10 border-brand/30'
                        : 'bg-surface-1 border-border hover:border-border-light',
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                      selected ? 'bg-brand/25 text-brand' : 'bg-surface-3 text-zinc-400',
                    )}>
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 text-left text-sm font-medium text-white">{user.name}</span>
                    <div className={clsx(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                      selected ? 'bg-brand border-brand' : 'border-zinc-700',
                    )}>
                      {selected && <Check size={10} strokeWidth={3} className="text-surface-0" />}
                    </div>
                  </button>
                )
              })}

              {/* Inline add member */}
              {showAddMember ? (
                <div className="bg-surface-1 border border-brand/30 rounded-xl px-4 py-3 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-zinc-300">Add member</p>
                    <button onClick={() => { setShowAddMember(false); setNewMemberName(''); setNewMemberPin('') }} className="text-zinc-500 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    autoFocus
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Name"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60"
                  />
                  <input
                    value={newMemberPin}
                    onChange={(e) => setNewMemberPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit PIN"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60"
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
                    className="w-full py-2 bg-brand hover:bg-brand-light rounded-lg text-sm font-semibold text-surface-0 transition-all"
                  >
                    Add & Select
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="w-full flex items-center gap-2 rounded-xl border border-dashed border-border hover:border-brand/30 px-4 py-3 transition-all text-zinc-500 hover:text-zinc-300"
                >
                  <UserPlus size={14} />
                  <span className="text-sm">Add new member</span>
                </button>
              )}
            </div>

            {selectedUserIds.length > 0 && (
              <div className="flex items-center gap-2 bg-surface-1 rounded-xl border border-border px-4 py-3">
                <span className="text-xs text-zinc-500 flex-1">
                  {selectedUserIds.length} participant{selectedUserIds.length > 1 ? 's' : ''} · GST split equally
                </span>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={selectedUserIds.length === 0}
              className="w-full py-3.5 bg-brand hover:bg-brand-light disabled:bg-surface-3 disabled:text-zinc-600 rounded-xl text-sm font-semibold text-surface-0 transition-all active:scale-98"
            >
              Create Session →
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
