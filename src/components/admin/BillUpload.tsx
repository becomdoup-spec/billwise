import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Image, AlertCircle, CheckCircle, Plus, Trash2,
  Sparkles, FileText, PencilLine, X, Info, Copy, Check,
  ScanLine, Calculator, ArrowUp, ArrowDown, ImagePlus, Layers,
} from 'lucide-react'
import type { ParsedBill } from '../../types'
import { emptyParsedBill } from '../../services/billParser'
import { BILL_AI_FORMAT_PROMPT, parseBillWithClaude, type AiProgress } from '../../services/claudeBillParser'
import { renderCleanBillImage } from '../../services/billImageRenderer'
import { stitchImagesVertically } from '../../services/imageStitcher'
import { formatCurrency, isBillSummaryItemName, generateId } from '../../services/calculations'
import clsx from 'clsx'

export type BillImageKind = 'formatted' | 'photo'

interface BillUploadProps {
  onParsed: (bill: ParsedBill, imageDataUrl?: string, imageKind?: BillImageKind) => void
}

interface BillPage {
  id: string
  dataUrl: string
  base64: string
  mediaType: string
}

type UploadMode = null | 'ai' | 'formatted' | 'manual'
type UploadState = 'idle' | 'format-info' | 'pages' | 'processing' | 'done' | 'error'
type CopyStatus = 'idle' | 'copied' | 'error'

const FORMAT_STRUCTURE = `MERCHANT / RESTAURANT NAME
Date: YYYY-MM-DD

ITEM | QTY | UNIT PRICE | AMOUNT
[Use the printed amount from the bill]

Subtotal | printed value
CGST | printed value, or 0.00
SGST | printed value, or 0.00
Grand Total | printed value`

// Progress checkpoints for the AI pipeline timeline
const AI_STEPS = [
  { at: 0, label: 'Preparing photos', icon: Image },
  { at: 22, label: 'Reading the bill', icon: ScanLine },
  { at: 55, label: 'Extracting items & prices', icon: FileText },
  { at: 84, label: 'Validating totals', icon: Calculator },
  { at: 94, label: 'Rendering clean bill', icon: Sparkles },
]

export function BillUpload({ onParsed }: BillUploadProps) {
  const [mode, setMode] = useState<UploadMode>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [pages, setPages] = useState<BillPage[]>([])
  const [progressLabel, setProgressLabel] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [displayPct, setDisplayPct] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [promptCopyStatus, setPromptCopyStatus] = useState<CopyStatus>('idle')
  const [preview, setPreview] = useState<string>('')
  const [previewKind, setPreviewKind] = useState<BillImageKind>('photo')
  const [editBill, setEditBill] = useState<ParsedBill>(emptyParsedBill())
  const fileRef = useRef<HTMLInputElement>(null)
  const addMoreRef = useRef<HTMLInputElement>(null)
  const targetPctRef = useRef(0)
  const animFrameRef = useRef<number>(0)
  const promptCopyTimerRef = useRef<number>(0)

  // Smoothly animate displayPct towards progressPct
  useEffect(() => {
    targetPctRef.current = progressPct
    const animate = () => {
      setDisplayPct((prev) => {
        const target = targetPctRef.current
        if (Math.abs(prev - target) < 0.5) return target
        // Move 8% of the gap per frame — fast at start, slower near target
        const next = prev + (target - prev) * 0.08
        animFrameRef.current = requestAnimationFrame(animate)
        return next
      })
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [progressPct])

  useEffect(() => () => {
    if (promptCopyTimerRef.current) window.clearTimeout(promptCopyTimerRef.current)
  }, [])

  // ── helpers ──────────────────────────────────────────────
  const resetToModeSelect = () => {
    setMode(null)
    setState('idle')
    setPages([])
    setPreview('')
    setErrorMsg('')
    setPromptCopyStatus('idle')
    setProgressPct(0)
    setDisplayPct(0)
  }

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) return 'Please upload an image file (JPG, PNG, WebP, HEIC)'
    if (file.size > 15 * 1024 * 1024) return 'Each image must be under 15 MB'
    return null
  }

  const readFileAsPage = (file: File): Promise<BillPage> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        resolve({ id: generateId(), dataUrl, base64: dataUrl.split(',')[1], mediaType: file.type })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const copyAiPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(BILL_AI_FORMAT_PROMPT)
      setPromptCopyStatus('copied')
    } catch {
      setPromptCopyStatus('error')
    }

    if (promptCopyTimerRef.current) window.clearTimeout(promptCopyTimerRef.current)
    promptCopyTimerRef.current = window.setTimeout(() => setPromptCopyStatus('idle'), 2200)
  }, [])

  // ── page collection ──────────────────────────────────────
  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    for (const file of files) {
      const err = validateFile(file)
      if (err) { setErrorMsg(err); setState('error'); return }
    }
    try {
      const newPages = await Promise.all(files.map(readFileAsPage))
      setErrorMsg('')
      setPages((prev) => [...prev, ...newPages])
      setState('pages')
    } catch {
      setErrorMsg('The photo could not be read. Try a different image.')
      setState('error')
    }
  }, [])

  const removePage = (id: string) => {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (next.length === 0) setState('idle')
      return next
    })
  }

  const movePage = (idx: number, dir: -1 | 1) => {
    setPages((prev) => {
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // ── AI processing (single or multi-photo) ────────────────
  const processPages = useCallback(async (pagesToProcess: BillPage[], renderClean: boolean) => {
    if (pagesToProcess.length === 0) return
    setState('processing')
    setProgressLabel(pagesToProcess.length > 1 ? `Combining ${pagesToProcess.length} photos…` : 'Preparing photo…')
    setProgressPct(5)

    try {
      const [result, stitched] = await Promise.all([
        parseBillWithClaude(
          pagesToProcess.map(({ base64, mediaType }) => ({ base64, mediaType })),
          (p: AiProgress) => {
            setProgressLabel(p.status)
            setProgressPct(Math.round(p.progress * 100))
          },
        ),
        stitchImagesVertically(pagesToProcess.map((p) => p.dataUrl)),
      ])

      setProgressLabel(renderClean ? 'Rendering clean bill image…' : 'Finalising formatted bill…')
      setProgressPct(96)

      setEditBill(result)
      if (renderClean) {
        setPreview(renderCleanBillImage(result))
        setPreviewKind('formatted')
      } else {
        setPreview(stitched)
        setPreviewKind('photo')
      }
      setState('done')
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'AI processing failed. Try another option.')
      setState('error')
    }
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    void addFiles(files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length === 0) return
    void addFiles(e.dataTransfer.files)
  }

  // ── Item editing helpers ─────────────────────────────────
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

  const handleConfirm = () => {
    const items = editBill.items.filter((item) => !isBillSummaryItemName(item.name))
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0)
    const final: ParsedBill = {
      ...editBill,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      totalAmount: editBill.totalAmount > 0
        ? editBill.totalAmount
        : Math.round((subtotal + editBill.cgst + editBill.sgst) * 100) / 100,
    }
    // The AI-mode preview is a rendered image; regenerate it so manual
    // corrections made in this review step are baked into the shared bill.
    const finalPreview = mode === 'ai' ? renderCleanBillImage(final) : preview
    onParsed(final, finalPreview || undefined, previewKind)
  }

  // ════════════════════════════════════════════════════════
  // ── MODE SELECTION ───────────────────────────────────────
  // ════════════════════════════════════════════════════════
  if (mode === null) {
    return (
      <div className="space-y-3 animate-list">
        <p className="text-xs text-fg-subtle">Choose how you'd like to add your bill</p>

        {/* Option 1 — AI */}
        <button
          onClick={() => { setMode('ai'); setState('idle') }}
          className="group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border border-primary/35 bg-primary/[0.08] px-4 py-4 text-left shadow-glow transition-[background-color,border-color,transform] duration-150 hover:border-primary/60 hover:bg-primary/[0.12] active:scale-[0.99]"
        >
          <span className="absolute right-3 top-3 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Recommended
          </span>
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary/20 transition-colors">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-20">
            <p className="text-sm font-semibold text-fg">Upload &amp; format using AI</p>
            <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
              Upload bill photos — long bills can span multiple photos, AI pieces them into one clean digital bill.
            </p>
          </div>
        </button>

        {/* Option 2 — Formatted */}
        <button
          onClick={() => { setMode('formatted'); setState('format-info') }}
          className="group flex w-full items-start gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left transition-[background-color,border-color,transform] duration-150 hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-overlay border border-line flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-surface-raised transition-colors">
            <FileText size={18} className="text-fg-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg">Upload formatted bill</p>
            <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
              Already have a bill in our standard format? AI validates row math and merges wrapped item lines.
            </p>
          </div>
        </button>

        {/* Option 3 — Manual */}
        <button
          onClick={() => {
            setEditBill(emptyParsedBill())
            setMode('manual')
            setState('done')
          }}
          className="group flex w-full items-start gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left transition-[background-color,border-color,transform] duration-150 hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-overlay border border-line flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-surface-raised transition-colors">
            <PencilLine size={18} className="text-fg-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg">Enter bill manually</p>
            <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
              Type in the restaurant name, items, prices, and taxes yourself.
            </p>
          </div>
        </button>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // ── FORMAT INFO POPUP (formatted mode) ──────────────────
  // ════════════════════════════════════════════════════════
  if (mode === 'formatted' && state === 'format-info') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-primary" />
            <span className="text-sm font-semibold text-fg">Expected bill format</span>
          </div>
          <button onClick={resetToModeSelect} className="text-fg-subtle hover:text-fg transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-fg-subtle leading-relaxed">
          For best AI accuracy, your bill should be clear enough to identify item names, quantities, printed prices, and printed totals.
        </p>

        <div className="bg-surface-raised border border-line rounded-xl p-4">
          <pre className="text-xs text-fg font-mono leading-relaxed whitespace-pre-wrap">{FORMAT_STRUCTURE}</pre>
        </div>

        <button
          type="button"
          onClick={copyAiPrompt}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition-[background-color,transform] duration-150 hover:bg-surface-raised active:scale-[0.98]"
        >
          {promptCopyStatus === 'copied' ? <Check size={15} className="text-success" /> : <Copy size={15} />}
          {promptCopyStatus === 'copied'
            ? 'Prompt copied'
            : promptCopyStatus === 'error'
              ? 'Copy failed'
              : 'Copy AI prompt'}
        </button>

        <div className="flex items-start gap-2 bg-warning/8 border border-warning/20 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            AI preserves printed money values. It may adjust Qty from pack counts like 3x1ea, but it should not recalculate or change printed amounts and totals.
          </p>
        </div>

        <button
          onClick={() => { setState('idle'); fileRef.current?.click() }}
          className="btn-sheen min-h-11 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-fg transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          Got it — upload my bill →
        </button>

        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={onFileChange} />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // ── IDLE / ERROR (ai or formatted mode, before upload) ──
  // ════════════════════════════════════════════════════════
  if (state === 'idle' || state === 'error') {
    const isAI = mode === 'ai'
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {isAI
              ? <Sparkles size={15} className="text-primary" />
              : <FileText size={15} className="text-fg-muted" />}
            <span className="text-sm font-semibold text-fg">
              {isAI ? 'Upload & format using AI' : 'Upload formatted bill'}
            </span>
          </div>
          <button onClick={resetToModeSelect} className="text-fg-subtle hover:text-fg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className={clsx(
            'relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]',
            state === 'error'
              ? 'border-danger/40 bg-danger/5'
              : 'border-line hover:border-primary/40 hover:bg-primary/5',
          )}
        >
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={onFileChange} />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-line flex items-center justify-center">
              <Image size={22} className="text-fg-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Drop bill photos here</p>
              <p className="text-xs text-fg-subtle mt-1">or tap to browse · JPG, PNG, WebP, HEIC</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-xl">
          <Layers size={13} className="text-primary shrink-0" />
          <p className="text-xs text-fg-subtle">
            Long bill? Add multiple photos (top part, bottom part) — they're pieced into one bill.
          </p>
        </div>

        {state === 'error' && (
          <div className="flex items-start gap-3 bg-danger/10 border border-danger/20 rounded-xl p-4 animate-slide-up">
            <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{errorMsg}</p>
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // ── PAGES REVIEW (before processing) ────────────────────
  // ════════════════════════════════════════════════════════
  if (state === 'pages') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-primary" />
            <span className="text-sm font-semibold text-fg">
              {pages.length === 1 ? 'Your bill photo' : `${pages.length} photos · one bill`}
            </span>
          </div>
          <button onClick={resetToModeSelect} className="text-fg-subtle hover:text-fg transition-colors" aria-label="Start over">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {pages.map((page, idx) => (
            <div key={page.id} className="anim-page-in group relative overflow-hidden rounded-xl border border-line bg-surface" style={{ animationDelay: `${idx * 60}ms` }}>
              <img src={page.dataUrl} alt={`Bill part ${idx + 1}`} className="h-28 w-full object-cover object-top" />
              <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removePage(page.id)}
                aria-label={`Remove photo ${idx + 1}`}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-[background-color,transform] duration-150 hover:bg-danger active:scale-90"
              >
                <X size={12} />
              </button>
              {pages.length > 1 && (
                <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => movePage(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move photo ${idx + 1} earlier`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-transform duration-150 active:scale-90 disabled:opacity-30"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePage(idx, 1)}
                    disabled={idx === pages.length - 1}
                    aria-label={`Move photo ${idx + 1} later`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-transform duration-150 active:scale-90 disabled:opacity-30"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add another photo tile */}
          <button
            type="button"
            onClick={() => addMoreRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line text-fg-subtle transition-[border-color,color,background-color,transform] duration-150 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.97]"
          >
            <ImagePlus size={18} />
            <span className="text-[10px] font-medium">Add photo</span>
          </button>
          <input ref={addMoreRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={onFileChange} />
        </div>

        {pages.length > 1 && (
          <div className="flex items-center gap-2 rounded-xl border border-info/20 bg-info/[0.07] px-3 py-2.5">
            <Info size={13} className="text-info shrink-0" />
            <p className="text-xs text-info">Keep photos in top-to-bottom bill order — use the arrows to rearrange.</p>
          </div>
        )}

        <button
          onClick={() => processPages(pages, mode === 'ai')}
          className="btn-sheen flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-fg shadow-glow transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          <Sparkles size={15} />
          {pages.length > 1 ? `Piece ${pages.length} photos into one bill →` : 'Read this bill →'}
        </button>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // ── PROCESSING — premium step timeline ──────────────────
  // ════════════════════════════════════════════════════════
  if (state === 'processing') {
    const pctRounded = Math.round(displayPct)
    const activeStepIdx = AI_STEPS.reduce((acc, step, i) => (pctRounded >= step.at ? i : acc), 0)
    return (
      <div className="flex flex-col gap-6 py-6 animate-fade-in">
        {/* Photo stack */}
        <div className="relative mx-auto h-28 w-28">
          {pages.slice(0, 3).map((page, i, arr) => {
            const offset = arr.length - 1 - i
            return (
              <div
                key={page.id}
                className="absolute inset-0 overflow-hidden rounded-xl border border-line shadow-card"
                style={{ transform: `translate(${offset * 6}px, ${offset * -6}px) rotate(${offset * 2.5}deg)`, zIndex: 10 - offset }}
              >
                <img src={page.dataUrl} alt="" className="h-full w-full object-cover object-top" />
              </div>
            )
          })}
          {/* Scan line sweep */}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
            <div
              className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-primary/35 to-transparent"
              style={{ animation: 'scanSweep 1.8s ease-in-out infinite' }}
            />
          </div>
        </div>

        {/* Step timeline */}
        <div className="space-y-1">
          {AI_STEPS.map((step, i) => {
            const done = i < activeStepIdx
            const active = i === activeStepIdx
            const Icon = step.icon
            return (
              <div
                key={step.label}
                className={clsx(
                  'anim-step-in flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-300',
                  active && 'bg-primary/[0.07]',
                )}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className={clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color] duration-300',
                  done
                    ? 'border-success/40 bg-success/15 text-success'
                    : active
                      ? 'anim-ring-pulse border-primary/50 bg-primary/15 text-primary'
                      : 'border-line bg-surface text-fg-faint',
                )}>
                  {done ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                </div>
                <span className={clsx(
                  'flex-1 text-xs font-medium transition-colors duration-300',
                  done ? 'text-fg-subtle line-through decoration-fg-faint/50' : active ? 'text-fg' : 'text-fg-faint',
                )}>
                  {step.label}
                </span>
                {active && (
                  <span className="font-mono text-xs font-semibold text-primary tabular-nums">{pctRounded}%</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
            <div
              className="relative h-full overflow-hidden rounded-full bg-primary"
              style={{ width: `${displayPct}%`, transition: 'width 0.05s linear' }}
            >
              <span
                className="absolute inset-0 opacity-40"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
                  animation: 'shimmer 1.4s infinite',
                }}
              />
            </div>
          </div>
          <p className="text-center text-[11px] text-fg-faint">{progressLabel || 'Processing…'}</p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // ── DONE — review & edit ────────────────────────────────
  // ════════════════════════════════════════════════════════
  const hasUnnamedItem = editBill.items.some((item) => !item.name.trim())
  const canConfirmBill = editBill.items.length > 0 && !hasUnnamedItem
  const billValidationMessage = editBill.items.length === 0
    ? 'Add at least one item before continuing.'
    : hasUnnamedItem ? 'Give every item a name before continuing.' : ''

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-success" />
          <span className="text-sm font-medium text-fg">
            {mode === 'ai'
              ? pages.length > 1 ? `AI formatted bill · ${pages.length} photos pieced` : 'AI formatted bill'
              : mode === 'formatted' ? 'AI parsed bill' : 'Manual entry'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {preview && mode !== 'manual' && (
            <button
              onClick={resetToModeSelect}
              className="min-h-11 rounded-lg border border-line bg-surface-overlay px-3 py-2 text-xs text-fg-muted transition-[color,background-color,border-color] duration-150 hover:text-fg"
            >
              Re-upload
            </button>
          )}
        </div>
      </div>

      {/* Preview — show clean image for AI mode */}
      {preview && mode === 'ai' && (
        <div className="w-full rounded-xl overflow-hidden border border-line bg-white animate-slide-up">
          <img src={preview} alt="AI-generated clean bill" className="w-full object-contain" />
        </div>
      )}

      {/* Restaurant & date */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-2">
        <label htmlFor="bill-restaurant" className="text-xs font-medium text-fg-subtle">Restaurant</label>
        <input
          id="bill-restaurant"
          value={editBill.restaurantName}
          onChange={(e) => setEditBill({ ...editBill, restaurantName: e.target.value })}
          placeholder="Restaurant name"
          className="min-h-11 w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none"
        />
        <label htmlFor="bill-date" className="block pt-1 text-xs font-medium text-fg-subtle">Bill date</label>
        <input
          id="bill-date"
          type="date"
          value={editBill.date}
          onChange={(e) => setEditBill({ ...editBill, date: e.target.value })}
          className="min-h-11 w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg focus:border-primary/60 focus:outline-none"
        />
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">
            Items {editBill.items.length ? `(${editBill.items.length})` : ''}
          </span>
          <button type="button" onClick={addItem} className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary-hover">
            <Plus size={12} /> Add item
          </button>
        </div>
        <div className="divide-y divide-line">
          {editBill.items.map((item, idx) => (
            <div key={idx} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id={`bill-item-name-${idx}`}
                  aria-label={`Item ${idx + 1} name`}
                  aria-invalid={!item.name.trim()}
                  value={item.name}
                  onChange={(e) => updateItem(idx, 'name', e.target.value)}
                  placeholder="Item name"
                  className="min-h-11 flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger/50"
                />
                <button type="button" onClick={() => removeItem(idx)} aria-label={`Remove ${item.name || `item ${idx + 1}`}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-danger/10 hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <label htmlFor={`bill-item-quantity-${idx}`} className="text-xs text-fg-subtle shrink-0">Qty</label>
                  <button
                    type="button"
                    onClick={() => updateItem(idx, 'quantity', Math.max(1, item.quantity - 1))}
                    aria-label={`Decrease ${item.name || `item ${idx + 1}`} quantity`}
                    className="h-11 w-11 rounded-lg border border-line bg-surface-raised text-fg-muted transition-colors hover:text-fg"
                  >−</button>
                  <input
                    id={`bill-item-quantity-${idx}`}
                    aria-label={`${item.name || `Item ${idx + 1}`} quantity`}
                    type="number" min="1" step="1" inputMode="numeric"
                    value={item.quantity || ''}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => updateItem(idx, 'quantity', Math.max(1, e.currentTarget.valueAsNumber || 1))}
                    className="h-11 w-14 rounded-lg border border-line bg-surface-raised px-1 text-center text-sm text-fg focus:border-primary/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateItem(idx, 'quantity', item.quantity + 1)}
                    aria-label={`Increase ${item.name || `item ${idx + 1}`} quantity`}
                    className="h-11 w-11 rounded-lg border border-line bg-surface-raised text-fg-muted transition-colors hover:text-fg"
                  >+</button>
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <label htmlFor={`bill-item-price-${idx}`} className="text-xs text-fg-subtle shrink-0">₹</label>
                  <input
                    id={`bill-item-price-${idx}`}
                    aria-label={`${item.name || `Item ${idx + 1}`} unit price`}
                    type="number" min="0" step="0.01"
                    value={item.unitPrice || ''}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="h-11 w-full rounded-lg border border-line bg-surface-raised px-2 text-sm text-fg focus:border-primary/60 focus:outline-none"
                  />
                </div>
                <div className="text-sm font-medium text-fg py-1.5 shrink-0">
                  {formatCurrency(item.totalPrice)}
                </div>
              </div>
            </div>
          ))}

          {editBill.items.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-fg-subtle">No items yet</p>
              <button type="button" onClick={addItem} className="mt-1 min-h-11 rounded-lg px-3 text-xs text-primary hover:bg-primary/10">
                Add an item
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tax & total */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-fg-muted">Subtotal</span>
          <span className="text-fg">{formatCurrency(editBill.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="bill-cgst" className="text-sm text-fg-muted">CGST</label>
          <input
            id="bill-cgst"
            type="number" min="0" step="0.01"
            value={editBill.cgst || ''}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const cgst = parseFloat(e.target.value) || 0
              setEditBill((b) => ({ ...b, cgst, totalAmount: b.subtotal + cgst + b.sgst }))
            }}
            className="h-11 w-28 rounded-lg border border-line bg-surface-raised px-2 text-right text-sm text-fg focus:border-primary/60 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="bill-sgst" className="text-sm text-fg-muted">SGST</label>
          <input
            id="bill-sgst"
            type="number" min="0" step="0.01"
            value={editBill.sgst || ''}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const sgst = parseFloat(e.target.value) || 0
              setEditBill((b) => ({ ...b, sgst, totalAmount: b.subtotal + b.cgst + sgst }))
            }}
            className="h-11 w-28 rounded-lg border border-line bg-surface-raised px-2 text-right text-sm text-fg focus:border-primary/60 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm font-semibold pt-2 border-t border-line">
          <label htmlFor="bill-total" className="text-fg">Invoice total</label>
          <input
            id="bill-total"
            type="number" min="0" step="0.01" inputMode="decimal"
            value={editBill.totalAmount || ''}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setEditBill((b) => ({ ...b, totalAmount: e.currentTarget.valueAsNumber || 0 }))}
            className="h-11 w-32 rounded-lg border border-line bg-surface-raised px-2 text-right text-sm text-primary focus:border-primary/60 focus:outline-none"
          />
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={!canConfirmBill}
        aria-describedby={billValidationMessage ? 'bill-form-guidance' : undefined}
        className="min-h-11 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-fg shadow-glow transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:bg-surface-overlay disabled:text-fg-faint disabled:shadow-none"
      >
        Use This Bill →
      </button>
      {billValidationMessage && (
        <p id="bill-form-guidance" role="status" className="flex items-center justify-center gap-1.5 text-xs text-warning">
          <AlertCircle size={12} /> {billValidationMessage}
        </p>
      )}
    </div>
  )
}
