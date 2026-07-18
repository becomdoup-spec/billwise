import type { BillItem, ParsedBill } from '../types'
import { renderCleanBillImage } from './billImageRenderer'
import { getPayableBillItems } from './calculations'
import { dbUploadBillImage, dbUpdateSession, dbDeleteBillImage } from '../lib/db'
import { useAppStore } from '../store/appStore'

/**
 * Keeps the stored formatted bill image in sync with the live bill items.
 * Only applies to app-rendered bills (storage paths named `formatted-*`) —
 * a real photo of a paper bill is ground truth and is never overwritten.
 */

export const FORMATTED_IMAGE_BASENAME = 'formatted'

export function isFormattedBillImagePath(path?: string): boolean {
  return Boolean(path && !path.startsWith('data:') && /\/formatted-\d+\.\w+$/.test(path))
}

// One regeneration at a time per session — rapid edits queue behind each other.
const syncQueues = new Map<string, Promise<void>>()

export function queueFormattedBillImageSync(sessionId: string): void {
  const previous = syncQueues.get(sessionId) ?? Promise.resolve()
  const run = previous
    .catch(() => undefined)
    .then(() => regenerate(sessionId))
    .catch((error) => console.error('[billImageSync]', error))
  syncQueues.set(sessionId, run)
}

async function regenerate(sessionId: string): Promise<void> {
  const state = useAppStore.getState()
  const session = state.sessions.find((s) => s.id === sessionId)
  if (!session || !isFormattedBillImagePath(session.billImageUrl)) return
  const items = getPayableBillItems(state.billItems[sessionId] ?? [])

  const bill: ParsedBill = {
    restaurantName: session.restaurantName,
    date: session.date,
    items: items.map((item: BillItem) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      category: item.category,
    })),
    subtotal: Math.round(items.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100,
    cgst: session.cgst,
    sgst: session.sgst,
    totalAmount: session.totalAmount,
  }

  const dataUrl = renderCleanBillImage(bill)
  const previousPath = session.billImageUrl
  // A fresh filename per version → bill_image_url changes → realtime pushes the
  // new image to every open device (and busts any cached signed URL).
  const path = await dbUploadBillImage(sessionId, dataUrl, `${FORMATTED_IMAGE_BASENAME}-${Date.now()}`)
  try {
    await dbUpdateSession(sessionId, { billImageUrl: path })
  } catch (error) {
    await dbDeleteBillImage(path)
    throw error
  }
  useAppStore.getState().updateSessionFromRealtime(sessionId, { billImageUrl: path })
  if (previousPath && previousPath !== path) void dbDeleteBillImage(previousPath)
}

/** Session creation stores the first formatted render under a versioned name. */
export function initialFormattedImageBaseName(): string {
  return `${FORMATTED_IMAGE_BASENAME}-${Date.now()}`
}
