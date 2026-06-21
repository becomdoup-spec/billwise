import type { Session, UserBillSummary } from '../types'
import type { jsPDF } from 'jspdf'
import { dbGetBillImageUrl } from '../lib/db'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48

function money(amount: number) {
  return `INR ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function filename(session: Session, extension: 'png' | 'pdf') {
  const name = (session.restaurantName || 'billwise')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${name || 'billwise'}-${session.orderId}-final-split.${extension}`
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
}

async function getOriginalBillSource(session: Session) {
  if (session.billImageBase64) {
    return session.billImageBase64.startsWith('data:')
      ? session.billImageBase64
      : `data:image/jpeg;base64,${session.billImageBase64}`
  }
  if (!session.billImageUrl) return null
  return dbGetBillImageUrl(session.billImageUrl)
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Original bill image could not be loaded'))
    image.src = source
  })
}

async function asDataUrl(source: string) {
  if (source.startsWith('data:')) return source
  const response = await fetch(source)
  if (!response.ok) throw new Error('Original bill image could not be downloaded')
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Original bill image could not be read'))
    reader.readAsDataURL(blob)
  })
}

export async function downloadSplitImage(session: Session, summaries: UserBillSummary[]) {
  const width = 1200
  const rowHeight = 64
  const originalBillSource = await getOriginalBillSource(session)
  const originalBill = originalBillSource
    ? await loadImage(await asDataUrl(originalBillSource))
    : null
  const billWidth = width - 144
  const billHeight = originalBill
    ? Math.min(4200, Math.round(originalBill.naturalHeight * (billWidth / originalBill.naturalWidth)))
    : 0
  const height = 330 + summaries.length * rowHeight + (originalBill ? billHeight + 150 : 0)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image export is unavailable in this browser')

  ctx.fillStyle = '#faf9f7'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#d4956a'
  ctx.fillRect(0, 0, 18, height)

  ctx.fillStyle = '#18181b'
  ctx.font = '700 44px Arial, sans-serif'
  ctx.fillText('BillWise Final Split', 72, 76)
  ctx.font = '700 28px Arial, sans-serif'
  ctx.fillText(session.restaurantName || 'Restaurant bill', 72, 126)
  ctx.fillStyle = '#71717a'
  ctx.font = '20px Arial, sans-serif'
  ctx.fillText(`#${session.orderId}  |  ${session.date}  |  ${summaries.length} people`, 72, 164)
  ctx.fillStyle = '#18181b'
  ctx.font = '700 22px Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`Invoice total: ${money(session.totalAmount)}`, width - 72, 126)
  ctx.textAlign = 'left'

  let y = 215
  ctx.fillStyle = '#e7e5e4'
  ctx.fillRect(60, y, width - 120, 48)
  ctx.fillStyle = '#52525b'
  ctx.font = '700 18px Arial, sans-serif'
  ctx.fillText('PERSON', 82, y + 31)
  ctx.textAlign = 'right'
  ctx.fillText('FINAL SHARE', width - 82, y + 31)
  ctx.textAlign = 'left'
  y += 48

  summaries.forEach((summary, index) => {
    if (index % 2 === 1) {
      ctx.fillStyle = '#f1f0ee'
      ctx.fillRect(60, y, width - 120, rowHeight)
    }
    ctx.fillStyle = '#d4956a'
    ctx.beginPath()
    ctx.arc(94, y + rowHeight / 2, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#18181b'
    ctx.font = '700 18px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(summary.userName.charAt(0).toUpperCase(), 94, y + 39)
    ctx.textAlign = 'left'
    ctx.font = '600 21px Arial, sans-serif'
    ctx.fillText(summary.userName, 132, y + 39)
    ctx.textAlign = 'right'
    ctx.font = '700 22px Arial, sans-serif'
    ctx.fillText(money(summary.grandTotal), width - 82, y + 39)
    ctx.textAlign = 'left'
    y += rowHeight
  })

  const groupTotal = summaries.reduce((sum, summary) => sum + summary.grandTotal, 0)
  ctx.strokeStyle = '#d4956a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(60, y + 20)
  ctx.lineTo(width - 60, y + 20)
  ctx.stroke()
  ctx.fillStyle = '#18181b'
  ctx.font = '700 24px Arial, sans-serif'
  ctx.fillText('Group total', 82, y + 66)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#b66f42'
  ctx.fillText(money(groupTotal), width - 82, y + 66)

  if (originalBill) {
    y += 125
    ctx.textAlign = 'left'
    ctx.fillStyle = '#18181b'
    ctx.font = '700 28px Arial, sans-serif'
    ctx.fillText('Original Bill', 72, y)
    y += 28
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(60, y, width - 120, billHeight + 24)
    ctx.drawImage(originalBill, 72, y + 12, billWidth, billHeight)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename(session, 'png'))
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function addPageNumbers(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setTextColor(161, 161, 170)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 24, { align: 'right' })
  }
}

export async function createSplitPdf(
  session: Session,
  summaries: UserBillSummary[],
  includePageNumbers = true,
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  const pageHeader = (continued = false) => {
    doc.setTextColor(24, 24, 27)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(`BillWise Final Split${continued ? ' (continued)' : ''}`, MARGIN, y)
    y += 25
    doc.setFontSize(13)
    doc.text(session.restaurantName || 'Restaurant bill', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(113, 113, 122)
    doc.setFontSize(9)
    doc.text(`#${session.orderId}  |  ${session.date}  |  Invoice ${money(session.totalAmount)}`, MARGIN, y + 16)
    y += 42
  }

  const ensureSpace = (height: number) => {
    if (y + height <= PAGE_HEIGHT - MARGIN) return
    doc.addPage()
    y = MARGIN
    pageHeader(true)
  }

  pageHeader()

  summaries.forEach((summary) => {
    ensureSpace(74)
    doc.setFillColor(247, 245, 242)
    doc.roundedRect(MARGIN, y - 15, PAGE_WIDTH - MARGIN * 2, 36, 5, 5, 'F')
    doc.setTextColor(24, 24, 27)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(summary.userName, MARGIN + 12, y + 7)
    doc.setTextColor(182, 111, 66)
    doc.text(money(summary.grandTotal), PAGE_WIDTH - MARGIN - 12, y + 7, { align: 'right' })
    y += 38

    summary.itemBreakdown.forEach(({ item, portionPercentage, amount }) => {
      ensureSpace(22)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(82, 82, 91)
      doc.setFontSize(9)
      const portion = portionPercentage < 100 ? ` (${portionPercentage}% portion)` : ''
      const itemLabel = doc.splitTextToSize(`${item.name}${portion}`, PAGE_WIDTH - MARGIN * 2 - 110)[0]
      doc.text(itemLabel, MARGIN + 12, y)
      doc.text(money(amount), PAGE_WIDTH - MARGIN - 12, y, { align: 'right' })
      y += 17
    })

    const sharedCharges = summary.cgstShare + summary.sgstShare + summary.additionalChargesShare
    if (sharedCharges > 0) {
      ensureSpace(20)
      doc.setTextColor(113, 113, 122)
      doc.text('Shared bill charges', MARGIN + 12, y)
      doc.text(money(sharedCharges), PAGE_WIDTH - MARGIN - 12, y, { align: 'right' })
      y += 17
    }
    y += 15
  })

  ensureSpace(42)
  const groupTotal = summaries.reduce((sum, summary) => sum + summary.grandTotal, 0)
  doc.setDrawColor(212, 149, 106)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 24
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(24, 24, 27)
  doc.setFontSize(12)
  doc.text('Group total', MARGIN, y)
  doc.setTextColor(182, 111, 66)
  doc.text(money(groupTotal), PAGE_WIDTH - MARGIN, y, { align: 'right' })

  if (includePageNumbers) addPageNumbers(doc)

  return doc
}

export function appendOriginalBillPage(doc: jsPDF, imageData: string) {
  const properties = doc.getImageProperties(imageData)
  const maxWidth = PAGE_WIDTH - MARGIN * 2
  const maxHeight = PAGE_HEIGHT - MARGIN * 2 - 36
  const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height)
  const renderedWidth = properties.width * scale
  const renderedHeight = properties.height * scale

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(24, 24, 27)
  doc.text('Original Bill', MARGIN, MARGIN)
  doc.addImage(
    imageData,
    properties.fileType,
    (PAGE_WIDTH - renderedWidth) / 2,
    MARGIN + 28,
    renderedWidth,
    renderedHeight,
    undefined,
    'FAST',
  )
}

export async function downloadSplitPdf(session: Session, summaries: UserBillSummary[]) {
  const doc = await createSplitPdf(session, summaries, false)
  const originalBillSource = await getOriginalBillSource(session)
  if (originalBillSource) {
    const imageData = await asDataUrl(originalBillSource)
    appendOriginalBillPage(doc, imageData)
  }
  addPageNumbers(doc)
  doc.save(filename(session, 'pdf'))
}
