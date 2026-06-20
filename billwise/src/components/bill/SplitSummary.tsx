import { Receipt, CheckCircle } from 'lucide-react'
import type { UserBillSummary } from '../../types'
import { formatCurrency } from '../../services/calculations'
import clsx from 'clsx'

interface SplitSummaryProps {
  summaries: UserBillSummary[]
  showAll?: boolean
  highlightUserId?: string
}

export function SplitSummary({ summaries, showAll, highlightUserId }: SplitSummaryProps) {
  const display = showAll ? summaries : summaries.filter((s) => s.userId === highlightUserId)

  if (display.length === 0) {
    return (
      <div className="text-center py-8">
        <Receipt size={24} className="text-zinc-700 mx-auto mb-2" />
        <p className="text-xs text-zinc-500">No selections yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {display.map((summary) => (
        <SummaryCard
          key={summary.userId}
          summary={summary}
          highlighted={summary.userId === highlightUserId}
        />
      ))}

      {showAll && (
        <div className="bg-surface-1 rounded-xl border border-border p-4">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-zinc-400">Group Total</span>
            <span className="text-brand">
              {formatCurrency(summaries.reduce((s, x) => s + x.grandTotal, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ summary, highlighted }: { summary: UserBillSummary; highlighted?: boolean }) {
  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden transition-all',
      highlighted ? 'border-brand/30 bg-brand/5' : 'border-border bg-surface-1',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
            highlighted ? 'bg-brand/20 text-brand' : 'bg-surface-3 text-zinc-300',
          )}>
            {summary.userName[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-white">{summary.userName}</span>
          {summary.isLocked && (
            <CheckCircle size={13} className="text-green-400" />
          )}
        </div>
        <span className={clsx('text-base font-bold', highlighted ? 'text-brand' : 'text-white')}>
          {formatCurrency(summary.grandTotal)}
        </span>
      </div>

      {/* Items */}
      {summary.itemBreakdown.length > 0 && (
        <div className="divide-y divide-border/40">
          {summary.itemBreakdown.map((entry, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 truncate">{entry.item.name}</p>
                {entry.portionPercentage < 100 && (
                  <p className="text-xs text-zinc-600">{entry.portionPercentage}% portion</p>
                )}
              </div>
              <span className="text-xs text-zinc-300 shrink-0">{formatCurrency(entry.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer breakdown */}
      <div className="px-4 py-2 bg-surface-0/40 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Items</span>
          <span className="text-zinc-300">{formatCurrency(summary.itemsTotal)}</span>
        </div>
        {summary.cgstShare > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">CGST (split equally)</span>
            <span className="text-zinc-300">{formatCurrency(summary.cgstShare)}</span>
          </div>
        )}
        {summary.sgstShare > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">SGST (split equally)</span>
            <span className="text-zinc-300">{formatCurrency(summary.sgstShare)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold pt-1 border-t border-border/40">
          <span className="text-zinc-300">Total</span>
          <span className={highlighted ? 'text-brand' : 'text-white'}>{formatCurrency(summary.grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}
