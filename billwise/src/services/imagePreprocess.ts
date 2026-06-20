/**
 * Pre-process a receipt image before OCR:
 *  1. Upscale to at least 2400px tall (Tesseract loves high-res)
 *  2. Convert to grayscale
 *  3. Adaptive thresholding (local contrast, handles uneven lighting)
 *  4. Light sharpening pass
 *
 * Returns a data-URL of the processed image (PNG, black text on white).
 */
export async function preprocessReceiptImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const MIN_HEIGHT = 2400
        const scale = img.naturalHeight < MIN_HEIGHT ? MIN_HEIGHT / img.naturalHeight : 1
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!

        // Draw scaled
        ctx.drawImage(img, 0, 0, w, h)

        // ── Grayscale ────────────────────────────────────────────
        const raw = ctx.getImageData(0, 0, w, h)
        const gray = toGrayscale(raw)

        // ── Adaptive threshold ───────────────────────────────────
        const binary = adaptiveThreshold(gray, w, h, 31, 10)

        // ── Sharpen ──────────────────────────────────────────────
        const sharp = sharpen(binary, w, h)

        ctx.putImageData(sharp, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// ── Helpers ──────────────────────────────────────────────────────

function toGrayscale(src: ImageData): ImageData {
  const data = new Uint8ClampedArray(src.data)
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    data[i] = data[i + 1] = data[i + 2] = g
  }
  return new ImageData(data, src.width, src.height)
}

/**
 * Adaptive threshold: each pixel is compared against the local average
 * in a blockSize×blockSize neighbourhood minus a constant C.
 * Text (dark on light) → becomes black; background → white.
 */
function adaptiveThreshold(src: ImageData, w: number, h: number, blockSize: number, C: number): ImageData {
  const out = new Uint8ClampedArray(src.data.length)
  const half = Math.floor(blockSize / 2)

  // Build integral image for fast box-blur average
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      const px = src.data[((y - 1) * w + (x - 1)) * 4]
      integral[y * (w + 1) + x] =
        px +
        integral[(y - 1) * (w + 1) + x] +
        integral[y * (w + 1) + (x - 1)] -
        integral[(y - 1) * (w + 1) + (x - 1)]
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half)
      const y1 = Math.max(0, y - half)
      const x2 = Math.min(w - 1, x + half)
      const y2 = Math.min(h - 1, y + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1]
      const mean = sum / count
      const px = src.data[(y * w + x) * 4]
      const val = px < mean - C ? 0 : 255
      const idx = (y * w + x) * 4
      out[idx] = out[idx + 1] = out[idx + 2] = val
      out[idx + 3] = 255
    }
  }
  return new ImageData(out, w, h)
}

/** 3×3 unsharp-mask style sharpen kernel */
function sharpen(src: ImageData, w: number, h: number): ImageData {
  const kernel = [
     0, -1,  0,
    -1,  5, -1,
     0, -1,  0,
  ]
  const out = new Uint8ClampedArray(src.data)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let val = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = src.data[((y + ky) * w + (x + kx)) * 4]
          val += px * kernel[(ky + 1) * 3 + (kx + 1)]
        }
      }
      const clamped = Math.max(0, Math.min(255, val))
      const idx = (y * w + x) * 4
      out[idx] = out[idx + 1] = out[idx + 2] = clamped
      out[idx + 3] = 255
    }
  }
  return new ImageData(out, w, h)
}
