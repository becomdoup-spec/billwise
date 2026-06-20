import { createWorker } from 'tesseract.js'
import type { ParsedBill } from '../types'
import { preprocessReceiptImage } from './imagePreprocess'
import { isBillSummaryItemName } from './calculations'

export type OcrProgress = {
  status: string
  progress: number // 0–1
}

/**
 * Run Tesseract OCR on a receipt image.
 * Pipeline: upscale → grayscale → adaptive threshold → sharpen → OCR → parse
 * Entirely local — no network calls, no API keys.
 */
export async function parseBillImage(
  imageBase64: string,
  mediaType: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<ParsedBill> {
  const dataUrl = `data:${mediaType};base64,${imageBase64}`

  // Step 1 — image preprocessing (Canvas, runs instantly)
  onProgress?.({ status: 'Enhancing image…', progress: 0.05 })
  const processedUrl = await preprocessReceiptImage(dataUrl)

  // Step 2 — Tesseract OCR on the cleaned image
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && m.progress != null) {
        // Map 0–1 progress into 0.1–1.0 range (leave 0–0.1 for preprocessing)
        onProgress({ status: m.status ?? 'Reading text…', progress: 0.1 + m.progress * 0.9 })
      }
    },
  })

  // Tesseract params tuned for receipts:
  // PSM 6 = assume single uniform block of text (best for receipts)
  // OEM 1 = LSTM neural net only
  await worker.setParameters({
    tessedit_pageseg_mode: '6' as never,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/:-%@&\'() ',
    preserve_interword_spaces: '1' as never,
  })

  const { data } = await worker.recognize(processedUrl)
  await worker.terminate()

  return extractBillFromText(data.text)
}

/** Parse raw OCR text into structured bill data */
export function extractBillFromText(raw: string): ParsedBill {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const bill = emptyParsedBill()

  // ── Restaurant name ───────────────────────────────────────────
  // First non-trivial line that isn't an address or number
  const nameSkip = /^\d|total|amount|bill|tax|gst|invoice|date|table|waiter|cover|tel|phone|fax|www|http|vat|tin|gstin/i
  for (const line of lines.slice(0, 8)) {
    if (line.length > 3 && !nameSkip.test(line)) {
      bill.restaurantName = line
      break
    }
  }

  // ── Date ──────────────────────────────────────────────────────
  // DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD etc.
  const datePats = [
    /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/,   // YYYY-MM-DD
    /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/,   // DD/MM/YYYY or MM/DD/YYYY
    /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})\b/,   // DD/MM/YY
  ]
  outer: for (const line of lines) {
    for (const pat of datePats) {
      const m = line.match(pat)
      if (m) {
        let yr: string, mo: string, dd: string
        if (m[1].length === 4) { yr = m[1]; mo = m[2]; dd = m[3] }
        else { dd = m[1]; mo = m[2]; yr = m[3].length === 2 ? `20${m[3]}` : m[3] }
        bill.date = `${yr}-${mo.padStart(2, '0')}-${dd.padStart(2, '0')}`
        break outer
      }
    }
  }

  // ── Item lines ────────────────────────────────────────────────
  // Skip header/footer lines
  const skipPat = /sub\s*total|grand\s*total|net\s*total|net\s*pay|net\s*to\s*pay|total\s*amount|^\s*total\b|total\s*qty|total\s*invoice|invoice\s*value|pay\s*:|service\s*charge|service\s*tax|staff\s*contribution|staff\s*charge|cgst|sgst|igst|v\.?a\.?t|s\.tax|discount|rounding|round\s*off|bill\s*no|bill\s*num|invoice|table|covers?|waiter|cashier|date|time|order|phone|address|thank|welcome|wifi|upi|receipt|copy|office|tin\s*no|gst\s*no|gstin|@\d+%|\bunit\b|qty|amt\b|dish\b|description/i

  let pendingItemName = ''
  for (const line of lines) {
    if (skipPat.test(line)) { pendingItemName = ''; continue }
    // Skip pure address / PIN-code lines: 5-6 digit number alone at end, preceded by city name
    if (/[a-z][\s\-]+\d{5,6}\s*$/i.test(line) && !/\d{1,3}\s*$/.test(line.replace(/\d{5,6}/, ''))) continue
    // Skip lines that look like phone / TIN / reference numbers (long digit runs with no letters)
    if (/^\d[\d\s\-]{6,}$/.test(line)) continue
    // Skip lines ending in a PIN code (6 digits with no decimal)
    if (/\b\d{6}\s*$/.test(line) && !/\.\d/.test(line)) continue
    // Keep one wrapped name line so receipts such as "CHICKEN DRUMS OF" / "HEAVEN 1 339" join correctly.
    if (!/\d+\.?\d*\s*$/.test(line)) {
      pendingItemName = /[a-z]{3}/i.test(line) && !/^-+$/.test(line)
        ? line.replace(/^[^a-z]+/i, '').trim()
        : ''
      continue
    }
    const item = parseItemLine(line)
    if (item && !isBillSummaryItemName(item.name)) {
      if (pendingItemName) {
        item.name = titleCase(`${pendingItemName} ${item.name}`)
      }
      bill.items.push(item)
    }
    pendingItemName = ''
  }

  // ── Totals ────────────────────────────────────────────────────
  bill.subtotal = extractAmount(lines, /sub\s*total/i)
    ?? round(bill.items.reduce((s, i) => s + i.totalPrice, 0))

  // VAT/Service charge — fold into a synthetic tax bucket
  const serviceCharge = extractAmount(lines, /service\s*charge/i) ?? 0
  const vatRaw = extractAmountAll(lines, /\bv\.?a\.?t\b/i)
  const vatTotal = vatRaw.reduce((a, b) => a + b, 0)

  bill.cgst = extractAmount(lines, /cgst/i) ?? 0
  bill.sgst = extractAmount(lines, /sgst/i) ?? 0

  if (bill.cgst === 0 && bill.sgst === 0) {
    // GST as single line
    const gst = extractAmount(lines, /\bgst\b(?!\s*no|in)/i)
    if (gst) { bill.cgst = round(gst / 2); bill.sgst = round(gst / 2) }
    else if (vatTotal > 0) {
      // Indian bill with VAT lines — split equally into cgst/sgst buckets
      const combined = round(vatTotal + serviceCharge)
      bill.cgst = round(combined / 2)
      bill.sgst = round(combined / 2)
    }
  }

  const totalCandidates = extractAmountAll(
    lines,
    /grand\s*total|net\s*to\s*pay|net\s*pay|net\s*total|total\s*amount|total\s*invoice|invoice\s*value|^pay\b|round\s+o.?f/i,
  ).filter((amount) => amount >= bill.subtotal)
  const grandTotal = totalCandidates.length > 0
    ? Math.max(...totalCandidates)
    : extractAmount(lines, /^total\b(?!\s*qty)/i)
  bill.totalAmount = grandTotal ?? round(bill.subtotal + bill.cgst + bill.sgst)

  if (bill.subtotal === 0 && bill.items.length > 0) {
    bill.subtotal = round(bill.items.reduce((s, i) => s + i.totalPrice, 0))
  }

  return bill
}

type RawItem = { name: string; quantity: number; unitPrice: number; totalPrice: number; category: string }

function parseItemLine(line: string): RawItem | null {
  // Normalise OCR noise: | → I, O→0 in number context, l→1 in number context
  const clean = line
    .replace(/\|/g, 'I')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Extract ALL numbers from the line
  const numMatches = [...clean.matchAll(/\b\d+(?:\.\d+)?\b/g)]
  const nums = numMatches.map((m) => parseFloat(m[0]))
  if (nums.length === 0) return null

  // Rightmost number = total price (amount column is always last)
  const totalPrice = nums[nums.length - 1]
  if (totalPrice < 1 || totalPrice > 500000) return null

  // Extract name: everything before the first number that isn't part of the name
  // Strategy: take text up to the first digit run
  const firstNumIdx = clean.search(/\d/)
  let namePart = firstNumIdx > 0 ? clean.slice(0, firstNumIdx) : clean.replace(/\d+\.?\d*/g, '')
  namePart = namePart
    .replace(/[xX×*#@!]/g, '')
    .replace(/[^\w\s\-&'().\/]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // If name is too short, try taking text after leading numbers ("2 x Chicken Burger  350")
  if (namePart.length < 3) {
    const afterLeadNums = clean.replace(/^\s*\d+\s*[xX×]?\s*/, '').replace(/\s*\d+\.?\d*\s*$/, '').trim()
    namePart = afterLeadNums.replace(/[^\w\s\-&'().\/]/g, ' ').trim()
  }

  if (!namePart || namePart.length < 2) return null
  if (/^[\-.\s]+$/.test(namePart)) return null

  // ── Determine quantity + unit price ──
  let qty = 1
  let unitPrice = totalPrice

  if (nums.length >= 3) {
    // Format: qty  unit_price  total  (most common Indian receipt format)
    const candidateQty = nums[0]
    const candidateUnit = nums[1]
    if (
      Number.isInteger(candidateQty) &&
      candidateQty >= 1 && candidateQty <= 50 &&
      Math.abs(round(candidateQty * candidateUnit) - totalPrice) < 1
    ) {
      qty = candidateQty
      unitPrice = candidateUnit
    }
  } else if (nums.length === 2) {
    const [a] = nums
    if (Number.isInteger(a) && a >= 1 && a <= 50 && a !== totalPrice) {
      qty = a
      unitPrice = round(totalPrice / a)
    }
  }

  return {
    name: titleCase(namePart),
    quantity: qty,
    unitPrice: round(unitPrice),
    totalPrice: round(totalPrice),
    category: guessCategory(namePart),
  }
}

function extractAmount(lines: string[], pattern: RegExp): number | null {
  for (const line of lines) {
    if (pattern.test(line)) {
      const nums = [...line.matchAll(/\d+\.?\d*/g)].map((m) => parseFloat(m[0]))
      if (/[%¢@]/.test(line) && nums.length === 1) continue
      if (nums.length > 0) return round(nums[nums.length - 1])
    }
  }
  return null
}

/** Returns amounts from ALL lines matching pattern (e.g. multiple VAT lines) */
function extractAmountAll(lines: string[], pattern: RegExp): number[] {
  const results: number[] = []
  for (const line of lines) {
    if (pattern.test(line)) {
      const nums = [...line.matchAll(/\d+\.?\d*/g)].map((m) => parseFloat(m[0]))
      if (/[%¢@]/.test(line) && nums.length === 1) continue
      if (nums.length > 0) results.push(round(nums[nums.length - 1]))
    }
  }
  return results
}

function guessCategory(name: string): string {
  const n = name.toLowerCase()
  if (/coffee|tea|chai|juice|shake|drink|water|soda|beer|wine|lassi|mojito|smoothie/.test(n)) return 'beverage'
  if (/cake|dessert|ice cream|brownie|pastry|sweet|mithai|gulab|halwa|pudding/.test(n)) return 'dessert'
  if (/pizza|burger|wrap|sandwich|roll|paratha|naan|roti|rice|biryani|pasta|noodle|dosa|idli/.test(n)) return 'food'
  return 'food'
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

export function emptyParsedBill(): ParsedBill {
  return {
    restaurantName: '',
    date: new Date().toISOString().split('T')[0],
    items: [],
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalAmount: 0,
  }
}
