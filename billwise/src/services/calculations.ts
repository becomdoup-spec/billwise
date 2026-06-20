import type { BillItem, ItemSelection, User, UserBillSummary } from '../types'

/**
 * Compute individual bill summary for every participant in a session.
 *
 * Split logic:
 *  - For each item, sum all selectors' portionPercentages → totalClaimed
 *  - Each user's actual cost = (myPortion / totalClaimed) × itemPrice
 *  - This means equal selectors (all 100%) split equally, and the slider
 *    sets a weighted portion (e.g. 60+40 → 60% and 40% of the price).
 *  - GST is always split equally among all participants.
 */
export function computeSplits(
  items: BillItem[],
  selections: ItemSelection[],
  participants: User[],
  cgst: number,
  sgst: number,
  lockedParticipantIds: string[] = [],
  totalAmount?: number,
): UserBillSummary[] {
  const payableItems = items.filter((item) => !isBillSummaryItemName(item.name))
  const participantCount = participants.length || 1
  const cgstShare = round(cgst / participantCount)
  const sgstShare = round(sgst / participantCount)
  const itemsSubtotal = round(payableItems.reduce((sum, item) => sum + item.totalPrice, 0))
  const fixedTotal = getFixedBillTotal(items, totalAmount)
  const sharedCharges = fixedTotal !== undefined
    ? Math.max(0, round(fixedTotal - itemsSubtotal))
    : round(cgst + sgst)
  const additionalCharges = Math.max(0, round(sharedCharges - cgst - sgst))
  const additionalChargesShare = round(additionalCharges / participantCount)

  // Pre-compute effective percentage each user pays per item.
  //
  // Rules:
  //   - portionPercentage < 100 → user set a custom slider; they pay that exact %.
  //   - portionPercentage === 100 → user is on the "equal split of remainder".
  //
  // Example: item = ₹1000, A=40%, B=100%, C=100%
  //   Fixed total = 40%, Remaining = 60%, Equal payers (B,C) each get 30%.
  //   A pays ₹400, B pays ₹300, C pays ₹300 → total ₹1000 ✓
  const effectivePctByItemUser: Record<string, Record<string, number>> = {}
  for (const item of payableItems) {
    const itemSels = selections.filter((s) => s.itemId === item.id)
    const fixed = itemSels.filter((s) => s.portionPercentage < 100)
    const equal = itemSels.filter((s) => s.portionPercentage === 100)
    const fixedTotal = fixed.reduce((sum, s) => sum + s.portionPercentage, 0)
    const remaining = Math.max(0, 100 - fixedTotal)
    const eachEqualPct = equal.length > 0 ? remaining / equal.length : 0
    const byUser: Record<string, number> = {}
    for (const s of fixed) byUser[s.userId] = s.portionPercentage
    for (const s of equal) byUser[s.userId] = eachEqualPct
    effectivePctByItemUser[item.id] = byUser
  }

  return participants.map((user) => {
    const userSelections = selections.filter((s) => s.userId === user.id)

    const itemBreakdown = userSelections.map((sel) => {
      const item = payableItems.find((i) => i.id === sel.itemId)!
      if (!item) return null
      const effectivePct = effectivePctByItemUser[item.id]?.[user.id] ?? 0
      const amount = round(item.totalPrice * effectivePct / 100)
      return { item, portionPercentage: round(effectivePct), amount }
    }).filter(Boolean) as UserBillSummary['itemBreakdown']

    const itemsTotal = round(itemBreakdown.reduce((sum, x) => sum + x.amount, 0))
    const isLocked = lockedParticipantIds.includes(user.id)

    return {
      userId: user.id,
      userName: user.name,
      itemBreakdown,
      itemsTotal,
      cgstShare,
      sgstShare,
      additionalChargesShare,
      grandTotal: round(itemsTotal + cgstShare + sgstShare + additionalChargesShare),
      isLocked,
    }
  })
}

export function getFixedBillTotal(items: BillItem[], storedTotal?: number): number | undefined {
  const itemsSubtotal = round(items
    .filter((item) => !isBillSummaryItemName(item.name))
    .reduce((sum, item) => sum + item.totalPrice, 0))
  const summaryTotals = items
    .filter((item) => isBillSummaryItemName(item.name) && item.totalPrice >= itemsSubtotal)
    .map((item) => item.totalPrice)
  return summaryTotals.length > 0 ? Math.min(...summaryTotals) : storedTotal
}

export function isBillSummaryItemName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(sub ?total|grand total|net (to pay|pay|total)|total( amount| bill| invoice.*)?|amount (payable|due)|invoice value|round.*|staff (contribution|charge).*|service (charge|tax).*|[csi]?gst.*|[as]?st|vat.*|pay)$/.test(normalized)
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/** Returns portion coverage per item: { itemId -> totalPortionClaimed } */
export function getItemPortionCoverage(
  items: BillItem[],
  selections: ItemSelection[],
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const total = selections
      .filter((s) => s.itemId === item.id)
      .reduce((sum, s) => sum + s.portionPercentage, 0)
    acc[item.id] = total
    return acc
  }, {})
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function generateOrderId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function hashPin(pin: string): string {
  // Simple deterministic hash for local storage demo
  // In production: use bcrypt via Supabase Edge Function
  let h = 0
  for (let i = 0; i < pin.length; i++) {
    h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36) + pin.length.toString()
}

export function verifyPin(plain: string, hashed: string): boolean {
  return hashPin(plain) === hashed
}
