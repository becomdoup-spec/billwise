import type { ParsedBill } from '../types'

export type AiProgress = { status: string; progress: number }

export const BILL_AI_FORMAT_PROMPT = `You are reading a receipt, invoice, estimate, or handwritten bill image.

Extract the data and return it in this EXACT plain text format — no markdown, no JSON, no extra explanation:

MERCHANT NAME
Date: YYYY-MM-DD

ITEM | QTY | UNIT PRICE | AMOUNT
[one item per line in same pipe-separated format]

Subtotal | [value]
CGST | [value]
SGST | [value]
Grand Total | [value]

Rules:
- Use two decimal places for all numbers (e.g. 120.00)
- No commas in numbers (e.g. 1234.50 not 1,234.50)
- If CGST or SGST not present, write 0.00
- Replace MERCHANT NAME with the actual shop, merchant, or restaurant name
- Replace YYYY-MM-DD with the actual date (or today if not found)
- Do not include the header row "ITEM | QTY | UNIT PRICE | AMOUNT" — only data rows
- Include only real purchasable line items; ignore addresses, phone numbers, dealer text, notes, totals, and business descriptions
- Preserve printed money values exactly: UNIT PRICE, AMOUNT, Subtotal, CGST, SGST, and Grand Total must come from the bill image when visible
- Do not recompute, correct, round to a different value, or balance Subtotal/Grand Total from the item rows
- Use arithmetic only to infer or correct QTY from visible AMOUNT / visible UNIT PRICE when that ratio is a whole number
- When QTY is adjusted, keep the original visible UNIT PRICE and AMOUNT unchanged
- If a row cannot be made consistent without changing visible money values, keep the visible money values and prefer discarding duplicate/continuation artifact rows
- If a line contains pack notation like "(3x1ea)", "3 x 1 ea", "3 pcs", or similar, treat it as QTY and remove it from the item name
- If the image shows unit price and line total but QTY is unclear, derive QTY from AMOUNT / UNIT PRICE when it is a whole number
- If an item name wraps onto the next line, merge the wrapped text into the same item name
- Never create a separate item row for continuation text, business notes, or description-only lines
- Never output fake rows with QTY 1 and UNIT PRICE/AMOUNT 0.00; those lines are either continuation text or should be ignored
- Prefer fewer complete rows over extra broken rows
- If the image shows "Premise (3x1ea) - 3400 - 10200", return "Premise | 3 | 3400.00 | 10200.00"
- If the image shows an item name on one line and its continuation/description on the next line, return one merged item row only`

/**
 * Parse a receipt image using OpenRouter (free tier).
 * Requires VITE_OPENROUTER_API_KEY in .env
 * Get a free key at https://openrouter.ai/keys
 */
export async function parseBillWithClaude(
  imageBase64: string,
  mediaType: string,
  onProgress?: (p: AiProgress) => void,
): Promise<ParsedBill> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error(
      'AI API key not configured. Add VITE_OPENROUTER_API_KEY to your .env file.\n' +
      'Get a free key at https://openrouter.ai/keys',
    )
  }

  onProgress?.({ status: 'AI is processing your bill…', progress: 0.2 })

  const MODELS = [
    'google/gemini-2.5-flash-lite',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'openrouter/auto',
  ]

  const messageContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
    { type: 'text', text: BILL_AI_FORMAT_PROMPT },
  ]

  let text = ''
  let lastError = ''

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]
    onProgress?.({ status: 'AI is reading your bill…', progress: 0.3 + i * 0.15 })

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: messageContent }],
          max_tokens: 1024,
          temperature: 0.1,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        lastError = `AI error ${response.status}: ${(err as any)?.error?.message ?? response.statusText}`
        continue
      }

      const data = await response.json()
      const candidate: string = data?.choices?.[0]?.message?.content ?? ''
      if (candidate.trim()) { text = candidate; break }
      lastError = 'AI returned empty response'
    } catch (e) {
      lastError = (e as Error).message
    }
  }

  onProgress?.({ status: 'AI is structuring your bill…', progress: 0.85 })

  if (!text.trim()) throw new Error(lastError || 'All AI models failed. Please try again in a moment.')

  return parseBillText(text.trim())
}

function parseBillText(text: string): ParsedBill {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  const restaurantName = lines[0] ?? ''

  const dateLine = lines.find((l) => /^date:/i.test(l))
  const date = dateLine?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().split('T')[0]

  const footerKeys = /^(subtotal|cgst|sgst|grand total|total)/i
  const headerKeys = /^item\s*\|/i

  const items: ParsedBill['items'] = []
  for (const line of lines) {
    if (!line.includes('|')) continue
    if (headerKeys.test(line)) continue
    if (footerKeys.test(line)) continue

    const parts = line.split('|').map((p) => p.trim())
    if (parts.length < 4) continue

    const name = parts[0]
    const quantity = parseNumber(parts[1]) ?? 1
    const unitPrice = parseNumber(parts[2]) ?? 0
    const totalPrice = parseNumber(parts[3]) ?? 0

    if (name && (unitPrice > 0 || totalPrice > 0)) {
      items.push({
        name,
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        totalPrice: Math.round(totalPrice * 100) / 100,
        category: 'food',
      })
    }
  }

  const getFooterVal = (key: RegExp): number | null => {
    const line = lines.find((l) => key.test(l))
    if (!line) return null
    const num = line.split('|').pop()?.trim() ?? line.replace(/[^\d.]/g, '')
    return parseNumber(num)
  }

  const subtotal = getFooterVal(/^subtotal/i) ?? items.reduce((s, i) => s + i.totalPrice, 0)
  const cgst = getFooterVal(/^cgst/i) ?? 0
  const sgst = getFooterVal(/^sgst/i) ?? 0
  const totalAmount = getFooterVal(/^grand total/i) ?? subtotal + cgst + sgst

  return {
    restaurantName,
    date,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  }
}

function parseNumber(value: string): number | null {
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null

  const parsed = Number.parseFloat(match[0])
  return Number.isFinite(parsed) ? parsed : null
}
