import type { ParsedBill } from '../types'

export type AiProgress = { status: string; progress: number }

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

  const prompt = `You are reading a restaurant receipt image.

Extract the data and return it in this EXACT plain text format — no markdown, no JSON, no extra explanation:

RESTAURANT NAME
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
- Replace RESTAURANT NAME with the actual restaurant name
- Replace YYYY-MM-DD with the actual date (or today if not found)
- Do not include the header row "ITEM | QTY | UNIT PRICE | AMOUNT" — only data rows`

  const MODELS = [
    'google/gemini-2.5-flash-lite',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'openrouter/auto',
  ]

  const messageContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
    { type: 'text', text: prompt },
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
    const quantity = parseFloat(parts[1]) || 1
    const unitPrice = parseFloat(parts[2]) || 0
    const totalPrice = parseFloat(parts[3]) || quantity * unitPrice

    if (name) {
      items.push({ name, quantity, unitPrice, totalPrice: Math.round(totalPrice * 100) / 100, category: 'food' })
    }
  }

  const getFooterVal = (key: RegExp): number => {
    const line = lines.find((l) => key.test(l))
    if (!line) return 0
    const num = line.split('|').pop()?.trim() ?? line.replace(/[^\d.]/g, '')
    return parseFloat(num) || 0
  }

  const subtotal = getFooterVal(/^subtotal/i) || items.reduce((s, i) => s + i.totalPrice, 0)
  const cgst = getFooterVal(/^cgst/i)
  const sgst = getFooterVal(/^sgst/i)
  const totalAmount = getFooterVal(/^grand total/i) || subtotal + cgst + sgst

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
