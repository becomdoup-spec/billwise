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
        <Receipt size={24} className="text-fg-faint mx-auto mb-2" />
        <p className="text-xs text-fg-subtle">No selections yet</p>
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
        <div className="bg-surface rounded-xl border border-line p-4">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-fg-muted">Group Total</span>
            <span className="text-primary">
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
      highlighted ? 'border-primary/30 bg-primary/5' : 'border-line bg-surface',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line/60">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
            highlighted ? 'bg-primary/20 text-primary' : 'bg-surface-overlay text-fg-muted',
          )}>
            {summary.userName[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-fg">{summary.userName}</span>
          {summary.isLocked && (
            <CheckCircle size={13} className="text-success" />
          )}
        </div>
        <span className={clsx('text-base font-bold', highlighted ? 'text-primary' : 'text-fg')}>
          {formatCurrency(summary.grandTotal)}
        </span>
      </div>

      {/* Items */}
      {summary.itemBreakdown.length > 0 && (
        <div className="divide-y divide-line/40">
          {summary.itemBreakdown.map((entry, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-fg-muted truncate">{entry.item.name}</p>
                {entry.portionPercentage < 100 && (
                  <p className="text-xs text-fg-faint">{entry.portionPercentage}% portion</p>
                )}
              </div>
              <span className="text-xs text-fg-muted shrink-0">{formatCurrency(entry.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer breakdown */}
      <div className="px-4 py-2 bg-canvas/40 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-fg-subtle">Items</span>
          <span className="text-fg-muted">{formatCurrency(summary.itemsTotal)}</span>
        </div>
        {summary.cgstShare > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-fg-subtle">CGST (split equally)</span>
            <span className="text-fg-muted">{formatCurrency(summary.cgstShare)}</span>
          </div>
        )}
        {summary.sgstShare > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-fg-subtle">SGST (split equally)</span>
            <span className="text-fg-muted">{formatCurrency(summary.sgstShare)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold pt-1 border-t border-line/40">
          <span className="text-fg-muted">Total</span>
          <span className={highlighted ? 'text-primary' : 'text-fg'}>{formatCurrency(summary.grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}
