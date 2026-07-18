const apply = process.argv.includes('--apply')
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

const apiHeaders = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
}

async function readJson(response, operation) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}): ${body.message ?? body.error ?? 'Unknown error'}`)
  }
  return body
}

function isRenderedBillImage(bytes, contentType) {
  const isPng = contentType === 'image/png' && bytes.subarray(1, 4).toString() === 'PNG'
  return isPng && bytes.length >= 24 && bytes.readUInt32BE(16) === 640
}

async function moveObject(fromPath, toPath) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/move`, {
    method: 'POST',
    headers: { ...apiHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucketId: 'bill-images',
      sourceKey: fromPath,
      destinationKey: toPath,
    }),
  })
  await readJson(response, `Moving ${fromPath}`)
}

const sessionsResponse = await fetch(
  `${supabaseUrl}/rest/v1/sessions?select=id,bill_image_url&bill_image_url=like.data%3A%25`,
  { headers: apiHeaders },
)
const sessions = await readJson(sessionsResponse, 'Reading inline bill images')

const inlineSessions = Array.isArray(sessions) ? sessions : []
const totalBytes = inlineSessions.reduce(
  (sum, session) => sum + Buffer.byteLength(session.bill_image_url ?? ''),
  0,
)

console.log(`Found ${inlineSessions.length} inline bill image(s), ${totalBytes} database bytes total.`)

if (!apply) {
  console.log('Dry run only. Use npm run migrate:bill-images:apply to migrate them.')
  process.exit(0)
}

for (const [index, session] of inlineSessions.entries()) {
  const dataUrl = session.bill_image_url ?? ''
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s)
  if (!match) throw new Error(`Session ${session.id} has an invalid inline bill image`)

  const contentType = match[1]
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const bytes = Buffer.from(match[2], 'base64')
  const fileBaseName = isRenderedBillImage(bytes, contentType)
    ? `formatted-${Date.now()}`
    : `original-migrated-${Date.now()}-${index}`
  const path = `${session.id}/${fileBaseName}.${extension}`

  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/bill-images/${encodedPath}`,
    {
      method: 'POST',
      headers: { ...apiHeaders, 'Content-Type': contentType, 'x-upsert': 'false' },
      body: bytes,
    },
  )
  await readJson(uploadResponse, `Uploading session ${session.id}`)

  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/sessions?id=eq.${encodeURIComponent(session.id)}&bill_image_url=like.data%3A%25&select=id`,
    {
      method: 'PATCH',
      headers: {
        ...apiHeaders,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ bill_image_url: path }),
    },
  )
  const updated = await readJson(updateResponse, `Updating session ${session.id}`)

  if (!Array.isArray(updated) || updated.length !== 1) {
    await fetch(`${supabaseUrl}/storage/v1/object/bill-images/${encodedPath}`, {
      method: 'DELETE',
      headers: apiHeaders,
    })
    throw new Error(`Database update failed for session ${session.id}: the row changed during migration`)
  }

  console.log(`Migrated session ${session.id}: ${bytes.length} bytes -> ${path}`)
}

const verifyResponse = await fetch(
  `${supabaseUrl}/rest/v1/sessions?select=id&bill_image_url=like.data%3A%25`,
  { headers: apiHeaders },
)
const remainingRows = await readJson(verifyResponse, 'Verifying migration')
if (!Array.isArray(remainingRows)) throw new Error('Migration verification returned an invalid response')
if (remainingRows.length !== 0) throw new Error(`${remainingRows.length} inline bill image(s) remain after migration`)

// Older runs named every migrated object "original". Detect app-rendered PNGs
// by their fixed 640px canvas width and restore the formatted-* convention so
// later bill edits continue regenerating the shared image.
const pathsResponse = await fetch(
  `${supabaseUrl}/rest/v1/sessions?select=id,bill_image_url&bill_image_url=not.is.null`,
  { headers: apiHeaders },
)
const pathRows = await readJson(pathsResponse, 'Reading migrated bill image paths')
for (const session of Array.isArray(pathRows) ? pathRows : []) {
  const currentPath = String(session.bill_image_url ?? '')
  if (!currentPath.includes('/original-migrated-')) continue

  const encodedCurrentPath = currentPath.split('/').map(encodeURIComponent).join('/')
  const downloadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/bill-images/${encodedCurrentPath}`,
    { headers: apiHeaders },
  )
  if (!downloadResponse.ok) {
    throw new Error(`Downloading ${currentPath} failed (${downloadResponse.status})`)
  }
  const bytes = Buffer.from(await downloadResponse.arrayBuffer())
  if (!isRenderedBillImage(bytes, downloadResponse.headers.get('content-type')?.split(';')[0])) continue

  const nextPath = `${session.id}/formatted-${Date.now()}.png`
  await moveObject(currentPath, nextPath)
  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/sessions?id=eq.${encodeURIComponent(session.id)}&bill_image_url=eq.${encodeURIComponent(currentPath)}&select=id`,
    {
      method: 'PATCH',
      headers: {
        ...apiHeaders,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ bill_image_url: nextPath }),
    },
  )
  const updated = await readJson(updateResponse, `Updating formatted image path for ${session.id}`)
  if (!Array.isArray(updated) || updated.length !== 1) {
    await moveObject(nextPath, currentPath)
    throw new Error(`Could not preserve the formatted image type for session ${session.id}`)
  }
  console.log(`Restored formatted image path for session ${session.id}: ${nextPath}`)
}

console.log('Migration complete. No inline bill images remain in sessions.bill_image_url.')
