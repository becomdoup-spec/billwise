import { useState, useRef, useCallback } from 'react'
import { Image, Loader2, AlertCircle, CheckCircle, Plus, Trash2 } from 'lucide-react'
import type { ParsedBill } from '../../types'
import { parseBillImage, emptyParsedBill, type OcrProgress } from '../../services/billParser'
import { formatCurrency, isBillSummaryItemName } from '../../services/calculations'
import clsx from 'clsx'

interface BillUploadProps {
  onParsed: (bill: ParsedBill, imageDataUrl?: string) => void
}

type UploadState = 'idle' | 'ocr' | 'done' | 'error'

export function BillUpload({ onParsed }: BillUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({ status: 'Starting…', progress: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<string>('')
  const [parsed, setParsed] = useState<ParsedBill | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editBill, setEditBill] = useState<ParsedBill>(emptyParsedBill())
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (JPG, PNG, WebP, HEIC)')
      setState('error')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Image must be under 15 MB')
      setState('error')
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type as string

      setState('ocr')
      setOcrProgress({ status: 'Loading OCR engine…', progress: 0 })

      try {
        const result = await parseBillImage(base64, mediaType, (p) => setOcrProgress(p))
        setParsed(result)
        setEditBill(result)
        setEditMode(true)
        setState('done')
      } catch (err) {
        setErrorMsg((err as Error).message ?? 'OCR failed. Try a clearer image or enter manually.')
        setState('error')
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleConfirm = () => {
    const bill = editMode ? editBill : parsed!
    const items = bill.items.filter((item) => !isBillSummaryItemName(item.name))
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0)
    const final: ParsedBill = {
      ...bill,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      totalAmount: bill.totalAmount > 0
        ? bill.totalAmount
        : Math.round((subtotal + bill.cgst + bill.sgst) * 100) / 100,
    }
    onParsed(final, preview || undefined)
  }

  const updateItem = (idx: number, field: string, value: string | number) => {
    const items = editBill.items.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unitPrice') {
        updated.totalPrice = Math.round(updated.quantity * updated.unitPrice * 100) / 100
      }
      return updated
    })
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0)
    setEditBill({ ...editBill, items, subtotal, totalAmount: subtotal + editBill.cgst + editBill.sgst })
  }

  const addItem = () => {
    setEditBill((b) => ({
      ...b,
      items: [...b.items, { name: '', quantity: 1, unitPrice: 0, totalPrice: 0, category: 'food' }],
    }))
  }

  const removeItem = (idx: number) => {
    const items = editBill.items.filter((_, i) => i !== idx)
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0)
    setEditBill({ ...editBill, items, subtotal, totalAmount: subtotal + editBill.cgst + editBill.sgst })
  }

  const bill = editMode ? editBill : parsed

  // ── IDLE / ERROR ──────────────────────────────────────────
  if (state === 'idle' || state === 'error') {
    return (
      <div className="space-y-4">
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className={clsx(
            'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
            state === 'error'
              ? 'border-danger/40 bg-danger/5'
              : 'border-line hover:border-primary/40 hover:bg-primary/5',
          )}
        >
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={onFileChange} />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-line flex items-center justify-center">
              <Image size={22} className="text-fg-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Drop bill image here</p>
              <p className="text-xs text-fg-subtle mt-1">or tap to browse · JPG, PNG, WebP, HEIC</p>
            </div>
          </div>
        </div>

        {/* OCR badge */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-xl">
          <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <p className="text-xs text-fg-subtle">
            Reads bills locally on this device.
          </p>
        </div>

        {state === 'error' && (
          <div className="flex items-start gap-3 bg-danger/10 border border-danger/20 rounded-xl p-4">
            <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{errorMsg}</p>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={() => {
              const empty = emptyParsedBill()
              setParsed(empty); setEditBill(empty); setEditMode(true); setState('done')
            }}
            className="text-xs text-fg-subtle hover:text-fg-muted underline underline-offset-2 transition-colors"
          >
            Enter bill manually instead
          </button>
        </div>
      </div>
    )
  }

  // ── OCR IN PROGRESS ───────────────────────────────────────
  if (state === 'ocr') {
    const pct = Math.round(ocrProgress.progress * 100)
    const statusLabel: Record<string, string> = {
      'loading tesseract core': 'Loading OCR engine…',
      'initializing tesseract': 'Initialising…',
      'loading language traineddata': 'Loading language data…',
      'initializing api': 'Starting up…',
      'recognizing text': 'Reading bill…',
    }
    const label = statusLabel[ocrProgress.status?.toLowerCase() ?? ''] ?? ocrProgress.status ?? 'Processing…'

    return (
      <div className="flex flex-col items-center gap-5 py-8">
        {preview && (
          <div className="w-24 h-24 rounded-xl overflow-hidden border border-line">
            <img src={preview} alt="bill" className="w-full h-full object-cover object-top" />
          </div>
        )}

        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-primary" />
              {label}
            </span>
            <span className="text-fg-subtle font-mono">{pct}%</span>
          </div>
          <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-fg-faint text-center">
          OCR runs entirely on your device · nothing is sent to any server
        </p>
      </div>
    )
  }

  // ── DONE — review & edit ──────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-success" />
          <span className="text-sm font-medium text-fg">
            {preview ? 'Bill read successfully' : 'Manual entry'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode((e) => !e)}
            className={clsx(
              'text-xs px-3 py-1.5 rounded-lg border transition-all',
              editMode
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-surface-overlay border-line text-fg-muted hover:text-fg',
            )}
          >
            {editMode ? 'Editing' : 'Edit'}
          </button>
          {preview && (
            <button
              onClick={() => { setState('idle'); setPreview(''); setParsed(null) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-line bg-surface-overlay text-fg-muted hover:text-fg transition-all"
            >
              Re-upload
            </button>
          )}
        </div>
      </div>

      {/* Image preview thumbnail */}
      {preview && !editMode && (
        <div className="w-full h-32 rounded-xl overflow-hidden border border-line">
          <img src={preview} alt="uploaded bill" className="w-full h-full object-cover object-top" />
        </div>
      )}

      {/* Restaurant & date */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-3">
        {editMode ? (
          <div className="space-y-2">
            <input
              value={editBill.restaurantName}
              onChange={(e) => setEditBill({ ...editBill, restaurantName: e.target.value })}
              placeholder="Restaurant name"
              className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/60"
            />
            <input
              type="date"
              value={editBill.date}
              onChange={(e) => setEditBill({ ...editBill, date: e.target.value })}
              className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-primary/60"
            />
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-fg">{bill?.restaurantName || 'Unknown Restaurant'}</p>
            <p className="text-xs text-fg-subtle mt-0.5">{bill?.date}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">
            Items {bill?.items.length ? `(${bill.items.length})` : ''}
          </span>
          {editMode && (
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors">
              <Plus size={12} /> Add item
            </button>
          )}
        </div>
        <div className="divide-y divide-line">
          {(bill?.items ?? []).map((item, idx) => (
            <div key={idx} className="px-4 py-3">
              {editMode ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(idx, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1 bg-surface-raised border border-line rounded-lg px-3 py-1.5 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-primary/60"
                    />
                    <button onClick={() => removeItem(idx)} className="p-1.5 text-fg-faint hover:text-danger transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-fg-subtle shrink-0">Qty</span>
                      <button
                        type="button"
                        onClick={() => updateItem(idx, 'quantity', Math.max(1, item.quantity - 1))}
                        className="w-7 h-8 rounded-lg border border-line bg-surface-raised text-fg-muted hover:text-fg"
                      >−</button>
                      <input
                        type="number" min="1" step="1" inputMode="numeric"
                        value={item.quantity || ''}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => updateItem(idx, 'quantity', Math.max(1, e.currentTarget.valueAsNumber || 1))}
                        className="w-14 bg-surface-raised border border-line rounded-lg px-1 py-1.5 text-sm text-fg text-center focus:outline-none focus:border-primary/60"
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(idx, 'quantity', item.quantity + 1)}
                        className="w-7 h-8 rounded-lg border border-line bg-surface-raised text-fg-muted hover:text-fg"
                      >+</button>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-fg-subtle shrink-0">₹</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.unitPrice || ''}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full bg-surface-raised border border-line rounded-lg px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-primary/60"
                      />
                    </div>
                    <div className="text-sm font-medium text-fg py-1.5 shrink-0">
                      {formatCurrency(item.totalPrice)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg truncate">{item.name}</p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {item.quantity > 1 ? `${item.quantity} × ${formatCurrency(item.unitPrice)}` : formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-fg shrink-0">{formatCurrency(item.totalPrice)}</span>
                </div>
              )}
            </div>
          ))}

          {(bill?.items?.length ?? 0) === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-fg-subtle">No items detected</p>
              <button onClick={() => setEditMode(true)} className="text-xs text-primary mt-1 hover:underline">
                Add items manually
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tax & total */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-fg-muted">Subtotal</span>
          <span className="text-fg">{formatCurrency(bill?.subtotal ?? 0)}</span>
        </div>
        {editMode ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">CGST</span>
              <input
                type="number" min="0" step="0.01"
                value={editBill.cgst || ''}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const cgst = parseFloat(e.target.value) || 0
                  setEditBill((b) => ({ ...b, cgst, totalAmount: b.subtotal + cgst + b.sgst }))
                }}
                className="w-28 bg-surface-raised border border-line rounded-lg px-2 py-1 text-sm text-fg text-right focus:outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">SGST</span>
              <input
                type="number" min="0" step="0.01"
                value={editBill.sgst || ''}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const sgst = parseFloat(e.target.value) || 0
                  setEditBill((b) => ({ ...b, sgst, totalAmount: b.subtotal + b.cgst + sgst }))
                }}
                className="w-28 bg-surface-raised border border-line rounded-lg px-2 py-1 text-sm text-fg text-right focus:outline-none focus:border-primary/60"
              />
            </div>
          </>
        ) : (
          <>
            {(bill?.cgst ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-fg-muted">CGST</span>
                <span className="text-fg-muted">{formatCurrency(bill?.cgst ?? 0)}</span>
              </div>
            )}
            {(bill?.sgst ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-fg-muted">SGST</span>
                <span className="text-fg-muted">{formatCurrency(bill?.sgst ?? 0)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex items-center justify-between gap-3 text-sm font-semibold pt-2 border-t border-line">
          <span className="text-fg">Invoice total</span>
          {editMode ? (
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={editBill.totalAmount || ''}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setEditBill((b) => ({ ...b, totalAmount: e.currentTarget.valueAsNumber || 0 }))}
              className="w-32 bg-surface-raised border border-line rounded-lg px-2 py-1 text-sm text-primary text-right focus:outline-none focus:border-primary/60"
            />
          ) : (
            <span className="text-primary">{formatCurrency(bill?.totalAmount ?? 0)}</span>
          )}
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={!bill?.items.length}
        className="w-full py-3.5 bg-primary hover:bg-primary-hover btn-sheen shadow-glow disabled:shadow-none disabled:bg-surface-overlay disabled:text-fg-faint rounded-xl text-sm font-semibold text-primary-fg transition-all active:scale-98"
      >
        Use This Bill →
      </button>
    </div>
  )
}
