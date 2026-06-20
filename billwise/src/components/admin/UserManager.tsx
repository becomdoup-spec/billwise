import { useState } from 'react'
import { Plus, Trash2, KeyRound, User, Shield, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Modal } from '../shared/Modal'
import { toast } from '../shared/Toast'
import clsx from 'clsx'

export function UserManager() {
  const { users, addUser, updateUserPin, deleteUser } = useAppStore()
  const [showAdd, setShowAdd] = useState(false)
  const [pinEditId, setPinEditId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [newPinValue, setNewPinValue] = useState('')
  const [showNewPin, setShowNewPin] = useState(false)
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null)

  const regularUsers = users.filter((u) => u.role === 'user')
  const adminUsers = users.filter((u) => u.role === 'admin')

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error('Name is required'); return }
    if (newPin.length !== 4) { toast.error('PIN must be 4 digits'); return }
    try {
      await addUser(newName.trim(), newPin, newRole)
      toast.success(`${newName} added`)
      setNewName(''); setNewPin(''); setShowAdd(false)
    } catch {
      toast.error('Member could not be saved')
    }
  }

  const handlePinUpdate = async () => {
    if (!pinEditId) return
    if (newPinValue.length !== 4) { toast.error('PIN must be 4 digits'); return }
    try {
      await updateUserPin(pinEditId, newPinValue)
      toast.success('PIN updated on every device')
      setPinEditId(null); setNewPinValue('')
    } catch {
      toast.error('PIN could not be saved to the cloud')
    }
  }

  const handleDelete = (id: string, name: string) => {
    if (users.filter((u) => u.role === 'admin').length === 1 && users.find((u) => u.id === id)?.role === 'admin') {
      toast.error('Cannot delete the only admin')
      return
    }
    setUserToDelete({ id, name })
  }

  return (
    <div className="space-y-4">
      {/* Admins */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Admins</span>
        </div>
        <div className="space-y-2">
          {adminUsers.map((u) => (
            <UserRow key={u.id} user={u} onPinEdit={() => setPinEditId(u.id)} onDelete={() => handleDelete(u.id, u.name)} />
          ))}
        </div>
      </section>

      {/* Members */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Members ({regularUsers.length})</span>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-brand hover:text-brand-light transition-colors"
          >
            <Plus size={12} /> Add member
          </button>
        </div>
        {regularUsers.length === 0 ? (
          <div className="text-center py-8 bg-surface-1 rounded-xl border border-border border-dashed">
            <User size={24} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No members yet</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-brand mt-1 hover:underline">
              Add your first member
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {regularUsers.map((u) => (
              <UserRow key={u.id} user={u} onPinEdit={() => setPinEditId(u.id)} onDelete={() => handleDelete(u.id, u.name)} />
            ))}
          </div>
        )}
      </section>

      {/* Add user modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Member">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Priya"
              autoFocus
              className="w-full bg-surface-1 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">PIN (4 digits)</label>
            <div className="relative">
              <input
                type={showNewPin ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full bg-surface-1 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60 font-mono tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShowNewPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Role</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setNewRole(r)}
                  className={clsx(
                    'flex-1 py-2.5 rounded-xl text-sm border transition-all capitalize',
                    newRole === r
                      ? 'bg-brand/20 border-brand/40 text-brand font-medium'
                      : 'bg-surface-1 border-border text-zinc-400 hover:text-white',
                  )}
                >
                  {r === 'admin' ? '🔐 Admin' : '👤 Member'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleAdd}
            className="w-full py-3 bg-brand hover:bg-brand-light rounded-xl text-sm font-semibold text-surface-0 transition-all active:scale-98"
          >
            Add {newRole === 'admin' ? 'Admin' : 'Member'}
          </button>
        </div>
      </Modal>

      {/* Edit PIN modal */}
      <Modal open={!!pinEditId} onClose={() => { setPinEditId(null); setNewPinValue('') }} title="Reset PIN">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Setting new PIN for <strong className="text-white">{users.find((u) => u.id === pinEditId)?.name}</strong>
          </p>
          <div className="relative">
            <input
              type={showNewPin ? 'text' : 'password'}
              value={newPinValue}
              onChange={(e) => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="New 4-digit PIN"
              autoFocus
              className="w-full bg-surface-1 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand/60 font-mono tracking-widest"
            />
            <button
              type="button"
              onClick={() => setShowNewPin((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={handlePinUpdate}
            className="w-full py-3 bg-brand hover:bg-brand-light rounded-xl text-sm font-semibold text-surface-0 transition-all"
          >
            Save New PIN
          </button>
        </div>
      </Modal>

      <Modal open={!!userToDelete} onClose={() => setUserToDelete(null)} title="Remove member" size="sm">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Remove <strong className="text-white">{userToDelete?.name}</strong> from BillWise and all sessions? This cannot be undone.
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setUserToDelete(null)}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-zinc-300 hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!userToDelete) return
              try {
                await deleteUser(userToDelete.id)
                toast.info(`${userToDelete.name} removed`)
                setUserToDelete(null)
              } catch {
                toast.error('Member could not be removed from the database')
              }
            }}
            className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Remove member
          </button>
        </div>
      </Modal>
    </div>
  )
}

function UserRow({ user, onPinEdit, onDelete }: { user: { id: string; name: string; role: string }; onPinEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-surface-1 border border-border rounded-xl px-4 py-3">
      <div className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
        user.role === 'admin' ? 'bg-brand/20 text-brand' : 'bg-surface-3 text-zinc-300',
      )}>
        {user.name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{user.name}</p>
        <p className="text-xs text-zinc-500 flex items-center gap-1">
          {user.role === 'admin' ? <Shield size={10} /> : <User size={10} />}
          {user.role}
        </p>
      </div>
      <button
        onClick={onPinEdit}
        className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Reset PIN"
      >
        <KeyRound size={15} />
      </button>
      <button
        onClick={onDelete}
        className="flex items-center gap-1 px-2 py-2 text-xs text-zinc-500 hover:text-red-400 transition-colors"
        title="Delete user"
      >
        <Trash2 size={14} /> Remove
      </button>
    </div>
  )
}
