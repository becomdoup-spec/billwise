import type { ParsedBill } from '../types'

export function renderCleanBillImage(bill: ParsedBill): string {
  const canvas = document.createElement('canvas')
  const W = 640
  const PAD = 44
  const LINE = 30
  const HEADER_H = 110
  const TABLE_HEADER_H = 50
  const ITEMS_H = bill.items.length * LINE
  const FOOTER_H = (2 + (bill.cgst > 0 ? 1 : 0) + (bill.sgst > 0 ? 1 : 0)) * LINE + 20
  canvas.width = W
  canvas.height = HEADER_H + TABLE_HEADER_H + ITEMS_H + FOOTER_H + PAD * 2

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const col = { item: PAD, qty: W * 0.58, unitPrice: W * 0.73, amount: W - PAD }

  let y = PAD

  // Restaurant name
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 20px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(bill.restaurantName || 'Restaurant', W / 2, y + 24)
  y += 36

  // Date
  ctx.font = '14px Arial, sans-serif'
  ctx.fillText(`Date: ${bill.date}`, W / 2, y + 16)
  y += 30

  // Divider
  ctx.fillStyle = '#000000'
  ctx.fillRect(PAD, y, W - PAD * 2, 1)
  y += 18

  // Table header
  ctx.font = 'bold 13px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('ITEM', col.item, y)
  ctx.textAlign = 'center'
  ctx.fillText('QTY', col.qty, y)
  ctx.fillText('UNIT PRICE', col.unitPrice, y)
  ctx.textAlign = 'right'
  ctx.fillText('AMOUNT', col.amount, y)
  y += 8
  ctx.fillRect(PAD, y, W - PAD * 2, 1)
  y += LINE - 8

  // Items
  ctx.font = '13px Arial, sans-serif'
  for (const item of bill.items) {
    ctx.textAlign = 'left'
    // Truncate long names
    const maxW = col.qty - col.item - 10
    let name = item.name
    ctx.font = '13px Arial, sans-serif'
    while (ctx.measureText(name).width > maxW && name.length > 4) {
      name = name.slice(0, -1)
    }
    if (name !== item.name) name = name.slice(0, -1) + '…'
    ctx.fillText(name, col.item, y)
    ctx.textAlign = 'center'
    ctx.fillText(String(item.quantity), col.qty, y)
    ctx.fillText(item.unitPrice.toFixed(2), col.unitPrice, y)
    ctx.textAlign = 'right'
    ctx.fillText(item.totalPrice.toFixed(2), col.amount, y)
    y += LINE
  }

  // Footer divider
  ctx.fillRect(PAD, y, W - PAD * 2, 1)
  y += LINE - 6

  const row = (label: string, value: number, bold = false) => {
    ctx.font = bold ? 'bold 14px Arial, sans-serif' : '13px Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, PAD, y)
    ctx.textAlign = 'right'
    ctx.fillText(value.toFixed(2), W - PAD, y)
    y += LINE
  }

  row('Subtotal', bill.subtotal)
  if (bill.cgst > 0) row('CGST', bill.cgst)
  if (bill.sgst > 0) row('SGST', bill.sgst)
  ctx.fillRect(PAD, y - LINE / 2, W - PAD * 2, 1)
  row('Grand Total', bill.totalAmount, true)

  return canvas.toDataURL('image/png')
}
