/**
 * Stitches multiple bill photos into one tall composite image.
 * Long receipts are often captured as 2+ photos — the composite becomes the
 * single "original bill" record that is stored and shared.
 */

const TARGET_MAX_WIDTH = 1600

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('A bill photo could not be read'))
    img.src = dataUrl
  })
}

export async function stitchImagesVertically(dataUrls: string[]): Promise<string> {
  if (dataUrls.length === 0) throw new Error('No bill photos to combine')
  if (dataUrls.length === 1) return dataUrls[0]

  const images = await Promise.all(dataUrls.map(loadImage))

  // Normalise every page to one width so columns line up seamlessly.
  const width = Math.min(
    TARGET_MAX_WIDTH,
    Math.max(...images.map((img) => img.naturalWidth)),
  )
  const scaledHeights = images.map((img) =>
    Math.round(img.naturalHeight * (width / img.naturalWidth)),
  )
  const totalHeight = scaledHeights.reduce((sum, h) => sum + h, 0)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bill photos could not be combined in this browser')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, totalHeight)
  ctx.imageSmoothingQuality = 'high'

  let y = 0
  images.forEach((img, i) => {
    ctx.drawImage(img, 0, y, width, scaledHeights[i])
    y += scaledHeights[i]
  })

  return canvas.toDataURL('image/jpeg', 0.92)
}
