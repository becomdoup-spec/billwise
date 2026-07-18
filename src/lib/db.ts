/**
 * Supabase DB layer — all CRUD operations for BillWise.
 * Each function is a no-op (returns empty / null) when Supabase is not configured.
 */
import { supabase } from './supabase'
import type { User, Session, BillItem, ItemSelection, Group } from '../types'

// ── Groups schema availability ────────────────────────────────────
// The groups feature needs a one-time migration (see SUPABASE_SETUP.md).
// Until it runs, every group-aware query falls back to legacy behaviour
// and this flag lets the UI explain what is missing.

let groupsSchemaMissingFlag = false

export function isGroupsSchemaMissing() {
  return groupsSchemaMissingFlag
}

function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  // 42P01/PGRST205: missing table · 42703: missing column · PGRST204: missing insert column
  return Boolean(error?.code && ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code))
}

/** Apply a group filter to a PostgREST query builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scopeToGroup<T extends { eq: any; is: any }>(query: T, groupId: string | null): T {
  return groupId === null ? query.is('group_id', null) : query.eq('group_id', groupId)
}

// ── Row → local type mappers ──────────────────────────────────────

function rowToGroup(r: Record<string, unknown>): Group {
  return {
    id: r.id as string,
    name: r.name as string,
    inviteCode: r.invite_code as string,
    ownerEmail: r.owner_email as string,
    createdAt: r.created_at as string,
  }
}

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    name: r.name as string,
    pin: r.pin_hash as string,        // stored as pin_hash, used as pin locally
    role: r.role as 'admin' | 'user',
    groupId: (r.group_id as string | null | undefined) ?? null,
    createdAt: r.created_at as string,
  }
}

function rowToSession(
  r: Record<string, unknown>,
  participantIds: string[],
  lockedParticipantIds: string[],
): Session {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    groupId: (r.group_id as string | null | undefined) ?? null,
    restaurantName: (r.restaurant_name as string) ?? '',
    date: r.date as string,
    billImageUrl: r.bill_image_url as string | undefined,
    status: r.status as Session['status'],
    isPublic: Boolean(r.is_public),
    subtotal: Number(r.subtotal),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    totalAmount: Number(r.total_amount),
    createdBy: (r.created_by as string) ?? '',
    createdAt: r.created_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    participantIds,
    lockedParticipantIds,
  }
}

function rowToItem(r: Record<string, unknown>): BillItem {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    name: r.name as string,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    totalPrice: Number(r.total_price),
    category: r.category as string | undefined,
  }
}

function rowToSelection(r: Record<string, unknown>): ItemSelection {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    userId: r.user_id as string,
    itemId: r.item_id as string,
    portionPercentage: Number(r.portion_percentage),
    lockedAt: r.locked_at as string | undefined,
  }
}

// ── Groups ────────────────────────────────────────────────────────

export class GroupsSchemaMissingError extends Error {
  constructor() {
    super('Groups needs a one-time database upgrade. Run the "Groups" SQL from SUPABASE_SETUP.md in the Supabase SQL editor.')
    this.name = 'GroupsSchemaMissingError'
  }
}

export async function dbCreateGroup(group: Group): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('groups').insert({
    id: group.id,
    name: group.name,
    invite_code: group.inviteCode,
    owner_email: group.ownerEmail,
    created_at: group.createdAt,
  })
  if (error) {
    console.error('[db] createGroup', error)
    if (isMissingSchemaError(error)) { groupsSchemaMissingFlag = true; throw new GroupsSchemaMissingError() }
    throw error
  }
}

export async function dbGetGroupByCode(inviteCode: string): Promise<Group | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('groups').select('*').eq('invite_code', inviteCode).maybeSingle()
  if (error) {
    console.error('[db] getGroupByCode', error)
    if (isMissingSchemaError(error)) { groupsSchemaMissingFlag = true; throw new GroupsSchemaMissingError() }
    throw error
  }
  return data ? rowToGroup(data) : null
}

/**
 * Resolve a group from whatever the user typed: an invite code ("ABCD"),
 * a full invite link, or the group's name ("Hyderabad Group").
 */
export async function dbFindGroupByInput(rawInput: string): Promise<Group | null> {
  if (!supabase) return null
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const codeCandidate = (trimmed.match(/\/join\/([a-z0-9]+)/i)?.[1] ?? trimmed).toLowerCase()
  if (/^[a-z0-9]{4,16}$/.test(codeCandidate)) {
    const byCode = await dbGetGroupByCode(codeCandidate)
    if (byCode) return byCode
  }

  // Fall back to an exact (case-insensitive) name match.
  const { data, error } = await supabase.from('groups').select('*').ilike('name', trimmed)
  if (error) {
    console.error('[db] findGroupByInput', error)
    if (isMissingSchemaError(error)) { groupsSchemaMissingFlag = true; throw new GroupsSchemaMissingError() }
    throw error
  }
  if ((data ?? []).length > 1) {
    throw new Error('Several groups share that name — use the group code instead.')
  }
  return data?.[0] ? rowToGroup(data[0]) : null
}

export async function dbGetGroupById(id: string): Promise<Group | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[db] getGroupById', error)
    if (isMissingSchemaError(error)) { groupsSchemaMissingFlag = true; return null }
    throw error
  }
  return data ? rowToGroup(data) : null
}

// ── Users ─────────────────────────────────────────────────────────

/**
 * Fetch users, scoped to a group when the groups schema exists.
 * `groupId === null` → legacy shared space (rows without a group).
 * `groupId === undefined` → no scoping (all rows).
 */
export async function dbGetUsers(groupId?: string | null): Promise<User[]> {
  if (!supabase) return []
  if (groupId !== undefined && !groupsSchemaMissingFlag) {
    const { data, error } = await scopeToGroup(supabase.from('users').select('*'), groupId).order('created_at')
    if (!error) return (data ?? []).map(rowToUser)
    if (!isMissingSchemaError(error)) { console.error('[db] getUsers', error); throw error }
    groupsSchemaMissingFlag = true // fall through to the unscoped query
  }
  const { data, error } = await supabase.from('users').select('*').order('created_at')
  if (error) { console.error('[db] getUsers', error); throw error }
  return (data ?? []).map(rowToUser)
}

export async function dbFindUserByPin(pinHash: string, groupId?: string | null): Promise<User | null> {
  if (!supabase) return null
  if (groupId !== undefined && !groupsSchemaMissingFlag) {
    const { data, error } = await scopeToGroup(
      supabase.from('users').select('*').eq('pin_hash', pinHash),
      groupId,
    ).maybeSingle()
    if (!error) return data ? rowToUser(data) : null
    if (isMissingSchemaError(error)) groupsSchemaMissingFlag = true
  }
  const { data } = await supabase.from('users').select('*').eq('pin_hash', pinHash).maybeSingle()
  return data ? rowToUser(data) : null
}

export async function dbCreateUser(user: User): Promise<void> {
  if (!supabase) return
  const row: Record<string, unknown> = {
    id: user.id, name: user.name, pin_hash: user.pin, role: user.role, created_at: user.createdAt,
  }
  if (!groupsSchemaMissingFlag) row.group_id = user.groupId ?? null
  const { error } = await supabase.from('users').upsert(row)
  if (error) {
    if (isMissingSchemaError(error) && 'group_id' in row) {
      groupsSchemaMissingFlag = true
      delete row.group_id
      const retry = await supabase.from('users').upsert(row)
      if (!retry.error) return
      console.error('[db] createUser', retry.error); throw retry.error
    }
    console.error('[db] createUser', error); throw error
  }
}

export async function dbUpdateUserPin(userId: string, pinHash: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('users').update({ pin_hash: pinHash }).eq('id', userId)
  if (error) { console.error('[db] updateUserPin', error); throw error }
}

export async function dbDeleteUser(userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('users').delete().eq('id', userId)
  if (error) { console.error('[db] deleteUser', error); throw error }
}

// ── Sessions ──────────────────────────────────────────────────────

export async function dbGetSessions(groupId?: string | null): Promise<Session[]> {
  if (!supabase) return []
  const sessionsQuery = groupId !== undefined && !groupsSchemaMissingFlag
    ? scopeToGroup(supabase.from('sessions').select('*'), groupId).order('created_at', { ascending: false })
    : supabase.from('sessions').select('*').order('created_at', { ascending: false })
  let [sessRes, lockedPartRes] = await Promise.all([
    sessionsQuery,
    supabase.from('session_participants').select('session_id, user_id, locked_at'),
  ])
  if (sessRes.error && isMissingSchemaError(sessRes.error)) {
    groupsSchemaMissingFlag = true
    sessRes = await supabase.from('sessions').select('*').order('created_at', { ascending: false })
  }
  if (sessRes.error) { console.error('[db] getSessions', sessRes.error); throw sessRes.error }

  let partRes = lockedPartRes
  if (lockedPartRes.error?.code === '42703') {
    console.error('[db] session_participants.locked_at is missing; run the migration in SUPABASE_SETUP.md')
    partRes = await supabase.from('session_participants').select('session_id, user_id')
  }
  if (partRes.error) { console.error('[db] getSessionParticipants', partRes.error); throw partRes.error }

  const participantMap: Record<string, string[]> = {}
  const lockedParticipantMap: Record<string, string[]> = {}
  for (const p of partRes.data ?? []) {
    if (!participantMap[p.session_id]) participantMap[p.session_id] = []
    participantMap[p.session_id].push(p.user_id)
    if (p.locked_at) {
      if (!lockedParticipantMap[p.session_id]) lockedParticipantMap[p.session_id] = []
      lockedParticipantMap[p.session_id].push(p.user_id)
    }
  }

  return (sessRes.data ?? []).map((r) => rowToSession(
    r,
    participantMap[r.id] ?? [],
    lockedParticipantMap[r.id] ?? [],
  ))
}

export async function dbCreateSession(session: Session): Promise<void> {
  if (!supabase) return
  const row: Record<string, unknown> = {
    id: session.id,
    order_id: session.orderId,
    restaurant_name: session.restaurantName,
    date: session.date,
    status: session.status,
    is_public: session.isPublic,
    subtotal: session.subtotal,
    cgst: session.cgst,
    sgst: session.sgst,
    total_amount: session.totalAmount,
    created_by: session.createdBy || null,
    created_at: session.createdAt,
  }
  if (!groupsSchemaMissingFlag) row.group_id = session.groupId ?? null
  const { error } = await supabase.from('sessions').upsert(row)
  if (error) {
    if (isMissingSchemaError(error) && 'group_id' in row) {
      groupsSchemaMissingFlag = true
      delete row.group_id
      const retry = await supabase.from('sessions').upsert(row)
      if (!retry.error) return
      console.error('[db] createSession', retry.error); throw retry.error
    }
    console.error('[db] createSession', error); throw error
  }
  // participants synced separately
}

export async function dbUpdateSession(id: string, data: Partial<Session>): Promise<void> {
  if (!supabase) return
  const patch: Record<string, unknown> = {}
  if (data.restaurantName !== undefined) patch.restaurant_name = data.restaurantName
  if (data.date !== undefined) patch.date = data.date
  if (data.status !== undefined) patch.status = data.status
  if (data.isPublic !== undefined) patch.is_public = data.isPublic
  if (data.subtotal !== undefined) patch.subtotal = data.subtotal
  if (data.cgst !== undefined) patch.cgst = data.cgst
  if (data.sgst !== undefined) patch.sgst = data.sgst
  if (data.totalAmount !== undefined) patch.total_amount = data.totalAmount
  if (data.billImageUrl !== undefined) patch.bill_image_url = data.billImageUrl
  if (data.completedAt !== undefined) patch.completed_at = data.completedAt
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('sessions').update(patch).eq('id', id)
    if (error) { console.error('[db] updateSession', error); throw error }
  }
}

export async function dbUploadBillImage(
  sessionId: string,
  imageDataUrl: string,
  fileBaseName = 'original',
): Promise<string | null> {
  if (!supabase) return null
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  const contentType = match[1]
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  const path = `${sessionId}/${fileBaseName}.${extension}`
  const { error } = await supabase.storage.from('bill-images').upload(path, bytes, {
    contentType,
    upsert: true,
  })
  if (error) { console.error('[db] uploadBillImage', error); return null }
  return path
}

export async function dbDeleteBillImage(path: string): Promise<void> {
  if (!supabase || !path || path.startsWith('http') || path.startsWith('data:')) return
  const { error } = await supabase.storage.from('bill-images').remove([path])
  if (error) console.error('[db] deleteBillImage', error) // best-effort cleanup only
}

export async function dbGetBillImageUrl(path: string): Promise<string | null> {
  if (path.startsWith('http') || path.startsWith('data:')) return path
  if (!supabase) return null
  const { data, error } = await supabase.storage.from('bill-images').createSignedUrl(path, 300)
  if (error) { console.error('[db] getBillImageUrl', error); return null }
  return data.signedUrl
}

export async function dbDeleteSession(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) { console.error('[db] deleteSession', error); throw error }
}

export async function dbAddParticipant(sessionId: string, userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('session_participants')
    .upsert(
      { session_id: sessionId, user_id: userId },
      { onConflict: 'session_id,user_id' },
    )
  if (error) { console.error('[db] addParticipant', error); throw error }
}

export async function dbRemoveParticipant(sessionId: string, userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('session_participants').delete().eq('session_id', sessionId).eq('user_id', userId)
  if (error) { console.error('[db] removeParticipant', error); throw error }
}

// ── Bill Items ────────────────────────────────────────────────────

export async function dbGetBillItems(sessionId: string): Promise<BillItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('bill_items').select('*').eq('session_id', sessionId)
  if (error) { console.error('[db] getBillItems', error); return [] }
  return (data ?? []).map(rowToItem)
}

export async function dbGetAllBillItems(): Promise<BillItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('bill_items').select('*')
  if (error) { console.error('[db] getAllBillItems', error); throw error }
  return (data ?? []).map(rowToItem)
}

export async function dbSetBillItems(sessionId: string, items: BillItem[]): Promise<void> {
  if (!supabase) return
  // Delete existing and replace
  const { error: deleteError } = await supabase.from('bill_items').delete().eq('session_id', sessionId)
  if (deleteError) { console.error('[db] clearBillItems', deleteError); throw deleteError }
  if (items.length) {
    const { error } = await supabase.from('bill_items').insert(items.map((i) => ({
      id: i.id, session_id: i.sessionId, name: i.name,
      quantity: i.quantity, unit_price: i.unitPrice, total_price: i.totalPrice, category: i.category,
    })))
    if (error) { console.error('[db] setBillItems', error); throw error }
  }
}

export async function dbCreateBillItem(item: BillItem): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('bill_items').insert({
    id: item.id,
    session_id: item.sessionId,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    category: item.category,
  })
  if (error) { console.error('[db] createBillItem', error); throw error }
}

export async function dbUpdateBillItem(itemId: string, data: Partial<BillItem>): Promise<void> {
  if (!supabase) return
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.quantity !== undefined) patch.quantity = data.quantity
  if (data.unitPrice !== undefined) patch.unit_price = data.unitPrice
  if (data.totalPrice !== undefined) patch.total_price = data.totalPrice
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('bill_items').update(patch).eq('id', itemId)
    if (error) { console.error('[db] updateBillItem', error); throw error }
  }
}

export async function dbDeleteBillItem(itemId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('bill_items').delete().eq('id', itemId)
  if (error) { console.error('[db] deleteBillItem', error); throw error }
}

// ── Selections ────────────────────────────────────────────────────

export async function dbGetSelections(sessionId: string): Promise<ItemSelection[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('item_selections').select('*').eq('session_id', sessionId)
  if (error) { console.error('[db] getSelections', error); return [] }
  return (data ?? []).map(rowToSelection)
}

export async function dbGetAllSelections(): Promise<ItemSelection[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('item_selections').select('*')
  if (error) { console.error('[db] getAllSelections', error); throw error }
  return (data ?? []).map(rowToSelection)
}

export async function dbUpsertSelection(sel: ItemSelection): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('item_selections')
    .upsert({
      id: sel.id,
      session_id: sel.sessionId,
      user_id: sel.userId,
      item_id: sel.itemId,
      portion_percentage: sel.portionPercentage,
      locked_at: sel.lockedAt ?? null,
    }, { onConflict: 'session_id,user_id,item_id' })
  if (error) { console.error('[db] upsertSelection', error); throw error }
}

export async function dbDeleteSelection(sessionId: string, userId: string, itemId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('item_selections')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('item_id', itemId)
  if (error) { console.error('[db] deleteSelection', error); throw error }
}

export async function dbLockUserSelections(sessionId: string, userId: string, lockedAt: string): Promise<void> {
  if (!supabase) return
  const [participantRes, selectionRes] = await Promise.all([
    supabase.from('session_participants')
      .update({ locked_at: lockedAt })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
    supabase.from('item_selections')
      .update({ locked_at: lockedAt })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
  ])
  if (participantRes.error) { console.error('[db] lockParticipant', participantRes.error); throw participantRes.error }
  if (selectionRes.error) { console.error('[db] lockUserSelections', selectionRes.error); throw selectionRes.error }
}

export async function dbUnlockUserSelections(sessionId: string, userId: string): Promise<void> {
  if (!supabase) return
  const [participantRes, selectionRes] = await Promise.all([
    supabase.from('session_participants')
      .update({ locked_at: null })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
    supabase.from('item_selections')
      .update({ locked_at: null })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
  ])
  if (participantRes.error) { console.error('[db] unlockParticipant', participantRes.error); throw participantRes.error }
  if (selectionRes.error) { console.error('[db] unlockUserSelections', selectionRes.error); throw selectionRes.error }
}

// ── App Settings ──────────────────────────────────────────────────

export async function dbGetAppSetting(key: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data ? (data.value as string) : null
}

export async function dbSetAppSetting(key: string, value: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('app_settings').upsert({ key, value })
  if (error) { console.error('[db] setAppSetting', error); throw error }
}

// Re-export rowToSelection for use in realtime subscription
export { rowToSelection }
