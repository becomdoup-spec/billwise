import { useState } from 'react'
import { Link2, Copy, Check, Share2, Users } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { toast } from '../shared/Toast'
import type { Group } from '../../types'
import clsx from 'clsx'

export function groupInviteLink(inviteCode: string): string {
  return `${window.location.origin}/join/${inviteCode}`
}

export function extractInviteCode(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = trimmed.match(/\/join\/([a-z0-9]+)/i)?.[1]
  const code = (fromUrl ?? trimmed).toLowerCase()
  return /^[a-z0-9]{4,16}$/.test(code) ? code : null
}

export function InviteLinkRow({ inviteCode, dense = false }: { inviteCode: string; dense?: boolean }) {
  const [copied, setCopied] = useState(false)
  const link = groupInviteLink(inviteCode)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — long-press the link to copy it')
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my BillWise group', url: link })
        return
      } catch { /* user dismissed the share sheet */ }
    } else {
      copy()
    }
  }

  return (
    <div className={clsx('space-y-2', !dense && 'rounded-xl border border-primary/25 bg-primary/[0.06] p-3')}>
      <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-raised px-3 py-2.5">
        <Link2 size={13} className="shrink-0 text-primary" />
        <span className="flex-1 truncate font-mono text-xs text-fg-muted">{link}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg transition-[background-color,transform] duration-150 hover:bg-surface-raised active:scale-[0.97]"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={share}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-fg transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.97]"
        >
          <Share2 size={13} />
          Share
        </button>
      </div>
    </div>
  )
}

/** In-group invite dialog — how new people get the link, from inside the group. */
export function InviteModal({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Invite to ${group.name}`} size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Users size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{group.name}</p>
            <p className="text-xs text-fg-subtle">
              Group code · <span className="font-mono font-semibold tracking-wider text-primary">{group.inviteCode.toUpperCase()}</span>
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-fg-subtle">
          Share the link, or just tell them the code — they can type it on the BillWise welcome screen.
        </p>
        <InviteLinkRow inviteCode={group.inviteCode} />
      </div>
    </Modal>
  )
}
