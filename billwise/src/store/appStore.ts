import { create } from 'zustand'
import type { User, Session, BillItem, ItemSelection } from '../types'
import { generateId, getSessionCompletionState, hashPin } from '../services/calculations'
import {
  dbFindUserByPin, dbCreateUser, dbUpdateUserPin, dbDeleteUser, dbGetUsers,
  dbCreateSession, dbUpdateSession, dbDeleteSession, dbUploadBillImage, dbAddParticipant, dbRemoveParticipant,
  dbSetBillItems, dbCreateBillItem, dbUpdateBillItem, dbDeleteBillItem,
  dbUpsertSelection, dbDeleteSelection, dbLockUserSelections, dbUnlockUserSelections,
  dbSetAppSetting,
} from '../lib/db'
import { applyAdminDefaultTheme } from './themeStore'
import type { Theme } from './themeStore'
import { supabase } from '../lib/supabase'

interface AppStore {
  // Data
  users: User[]
  sessions: Session[]
  billItems: Record<string, BillItem[]>
  selections: ItemSelection[]
  apiKey: string
  cloudReady: boolean
  cloudSyncError: string
  selectionsReady: boolean

  // Settings
  requirePin: boolean
  setRequirePin: (val: boolean) => Promise<void>
  hydrateRequirePin: (val: boolean) => void
  showCompletedBills: boolean
  setShowCompletedBills: (val: boolean) => Promise<void>
  hydrateShowCompletedBills: (val: boolean) => void
  defaultTheme: string
  setDefaultTheme: (theme: string) => Promise<void>
  hydrateDefaultTheme: (theme: string) => void

  // Auth
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  verifyAndLogin: (pin: string) => Promise<User | null>

  // API key (kept for compat, no longer used)
  setApiKey: (key: string) => void

  // User management
  addUser: (name: string, pin: string, role: 'admin' | 'user') => Promise<User>
  updateUserPin: (userId: string, newPin: string) => Promise<void>
  deleteUser: (userId: string) => Promise<void>

  // Session management
  createSession: (data: Omit<Session, 'id' | 'orderId' | 'createdAt' | 'participantIds' | 'lockedParticipantIds' | 'status'>) => Promise<Session>
  updateSession: (id: string, data: Partial<Session>) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  saveBillImage: (sessionId: string, imageDataUrl: string) => Promise<boolean>
  addParticipant: (sessionId: string, userId: string) => Promise<void>
  removeParticipant: (sessionId: string, userId: string) => Promise<void>
  lockSession: (sessionId: string) => Promise<void>

  // Bill items
  setBillItems: (sessionId: string, items: BillItem[]) => Promise<void>
  setBillItemsForSession: (sessionId: string, items: BillItem[]) => void
  addBillItem: (sessionId: string, item: Omit<BillItem, 'id' | 'sessionId'>) => Promise<BillItem>
  updateBillItem: (sessionId: string, itemId: string, data: Partial<BillItem>) => Promise<void>
  removeBillItem: (sessionId: string, itemId: string) => Promise<void>

  // Selections
  setSelection: (sessionId: string, userId: string, itemId: string, portion: number) => Promise<void>
  removeSelection: (sessionId: string, userId: string, itemId: string) => Promise<void>
  lockUserSelections: (sessionId: string, userId: string) => Promise<void>
  unlockUserSelections: (sessionId: string, userId: string) => Promise<void>
  getSelections: (sessionId: string) => ItemSelection[]
  getUserSelections: (sessionId: string, userId: string) => ItemSelection[]

  // Supabase sync helpers (called by hooks)
  hydrateFromSupabase: (users: User[], sessions: Session[]) => void
  setCloudSyncState: (ready: boolean, error?: string) => void
  hydrateBillItemsFromSupabase: (items: BillItem[]) => void
  hydrateSelectionsFromSupabase: (selections: ItemSelection[]) => void
  updateSessionFromRealtime: (sessionId: string, data: Partial<Session>) => void
  setSelectionsForSession: (sessionId: string, sels: ItemSelection[]) => void
  updateBillItemFromRealtime: (sessionId: string, itemId: string, data: Partial<BillItem>) => void
  upsertSelectionFromRealtime: (sel: ItemSelection) => void
  removeSelectionFromRealtime: (sessionId: string, userId: string, itemId: string) => void
  setParticipantLockFromRealtime: (sessionId: string, userId: string, locked: boolean) => void
}

function requireCloudConnection() {
  if (!supabase) {
    throw new Error('Supabase is not configured for this deployment')
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
      users: [],
      sessions: [],
      billItems: {},
      selections: [],
      apiKey: '',
      cloudReady: !supabase,
      cloudSyncError: supabase ? '' : 'Supabase is not configured for this deployment',
      selectionsReady: false,
      currentUser: null,
      requirePin: true,
      showCompletedBills: true,
      defaultTheme: 'light',

      setRequirePin: async (val) => {
        set({ requirePin: val })
        await dbSetAppSetting('require_pin', val ? 'true' : 'false')
      },

      hydrateRequirePin: (val) => set({ requirePin: val }),

      setShowCompletedBills: async (val) => {
        set({ showCompletedBills: val })
        await dbSetAppSetting('show_completed_bills', val ? 'true' : 'false')
      },

      hydrateShowCompletedBills: (val) => set({ showCompletedBills: val }),

      setDefaultTheme: async (theme) => {
        set({ defaultTheme: theme })
        applyAdminDefaultTheme(theme as Theme)
        await dbSetAppSetting('default_theme', theme)
      },

      hydrateDefaultTheme: (theme) => {
        set({ defaultTheme: theme })
        applyAdminDefaultTheme(theme as Theme)
      },

      setCurrentUser: (user) => set({ currentUser: user }),

      verifyAndLogin: async (pin) => {
        const h = hashPin(pin)
        // Try Supabase first (cross-device), fall back to local
        if (supabase) {
          const dbUser = await dbFindUserByPin(h)
          if (dbUser) {
            // Keep local store in sync
            set((s) => ({
              currentUser: dbUser,
              users: s.users.some((u) => u.id === dbUser.id)
                ? s.users.map((u) => u.id === dbUser.id ? dbUser : u)
                : [...s.users, dbUser],
            }))
            return dbUser
          }
        }
        // Local fallback
        const user = get().users.find((u) => u.pin === h)
        if (user) set({ currentUser: user })
        return user ?? null
      },

      setApiKey: (key) => set({ apiKey: key }),

      addUser: async (name, pin, role) => {
        requireCloudConnection()
        const user: User = {
          id: generateId(),
          name,
          pin: hashPin(pin),
          role,
          createdAt: new Date().toISOString(),
        }
        await dbCreateUser(user)
        // Optimistic update first so it shows instantly on this device
        set((s) => ({ users: [...s.users.filter((u) => u.id !== user.id), user] }))
        // Then sync full list from Supabase to guarantee consistency
        dbGetUsers().then((fresh) => {
          if (fresh.length > 0) set({ users: fresh })
        }).catch(() => {/* silent — optimistic update is already applied */})
        return user
      },

      updateUserPin: async (userId, newPin) => {
        requireCloudConnection()
        const hashed = hashPin(newPin)
        await dbUpdateUserPin(userId, hashed)
        set((s) => ({
          users: s.users.map((u) => u.id === userId ? { ...u, pin: hashed } : u),
          currentUser: s.currentUser?.id === userId ? { ...s.currentUser, pin: hashed } : s.currentUser,
        }))
      },

      deleteUser: async (userId) => {
        requireCloudConnection()
        await dbDeleteUser(userId)
        set((s) => ({
          users: s.users.filter((u) => u.id !== userId),
          sessions: s.sessions.map((sess) => ({
            ...sess,
            participantIds: sess.participantIds.filter((id) => id !== userId),
            lockedParticipantIds: (sess.lockedParticipantIds ?? []).filter((id) => id !== userId),
          })),
          selections: s.selections.filter((sel) => sel.userId !== userId),
        }))
      },

      createSession: async (data) => {
        requireCloudConnection()
        const session: Session = {
          ...data,
          id: generateId(),
          orderId: Array.from({ length: 8 }, () =>
            'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
          ).join(''),
          status: 'active',
	          isPublic: data.isPublic,
          participantIds: [],
          lockedParticipantIds: [],
          createdAt: new Date().toISOString(),
        }
        await dbCreateSession(session)
        set((s) => ({ sessions: [...s.sessions.filter((item) => item.id !== session.id), session] }))
        return session
      },

      updateSession: async (id, data) => {
        requireCloudConnection()
        await dbUpdateSession(id, data)
        set((s) => ({
          sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, ...data } : sess),
        }))
      },

      deleteSession: async (id) => {
        requireCloudConnection()
        await dbDeleteSession(id)
        set((s) => {
          const billItems = { ...s.billItems }
          delete billItems[id]
          return {
            sessions: s.sessions.filter((sess) => sess.id !== id),
            billItems,
            selections: s.selections.filter((sel) => sel.sessionId !== id),
          }
        })
      },

      saveBillImage: async (sessionId, imageDataUrl) => {
        requireCloudConnection()
        const path = await dbUploadBillImage(sessionId, imageDataUrl)
        const storedImage = path ?? imageDataUrl
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, billImageUrl: storedImage } : sess,
          ),
        }))
        await dbUpdateSession(sessionId, { billImageUrl: storedImage })
        return Boolean(path)
      },

      addParticipant: async (sessionId, userId) => {
        requireCloudConnection()
        await dbAddParticipant(sessionId, userId)
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId && !sess.participantIds.includes(userId)
              ? { ...sess, participantIds: [...sess.participantIds, userId] }
              : sess,
          ),
        }))
      },

      removeParticipant: async (sessionId, userId) => {
        requireCloudConnection()
        await dbRemoveParticipant(sessionId, userId)
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  participantIds: sess.participantIds.filter((id) => id !== userId),
                  lockedParticipantIds: (sess.lockedParticipantIds ?? []).filter((id) => id !== userId),
                }
              : sess,
          ),
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.userId === userId),
          ),
        }))
      },

      lockSession: async (sessionId) => {
        requireCloudConnection()
        await dbUpdateSession(sessionId, { status: 'locked' })
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, status: 'locked' } : sess,
          ),
        }))
      },

      setBillItems: async (sessionId, items) => {
        requireCloudConnection()
        await dbSetBillItems(sessionId, items)
        set((s) => ({ billItems: { ...s.billItems, [sessionId]: items } }))
      },

      setBillItemsForSession: (sessionId, items) => {
        set((s) => ({ billItems: { ...s.billItems, [sessionId]: items } }))
      },

      addBillItem: async (sessionId, item) => {
        requireCloudConnection()
        const newItem: BillItem = { ...item, id: generateId(), sessionId }
        await dbCreateBillItem(newItem)
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: [...(s.billItems[sessionId] ?? []), newItem],
          },
        }))
        return newItem
      },

      updateBillItem: async (sessionId, itemId, data) => {
        await dbUpdateBillItem(itemId, data)
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: (s.billItems[sessionId] ?? []).map((item) =>
              item.id === itemId ? { ...item, ...data } : item,
            ),
          },
        }))
      },

      removeBillItem: async (sessionId, itemId) => {
        requireCloudConnection()
        await dbDeleteBillItem(itemId)
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: (s.billItems[sessionId] ?? []).filter((i) => i.id !== itemId),
          },
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.itemId === itemId),
          ),
        }))
      },

      setSelection: async (sessionId, userId, itemId, portion) => {
        requireCloudConnection()
        const state = get()
        const participantLocked = state.sessions.some((session) =>
          session.id === sessionId && (session.lockedParticipantIds ?? []).includes(userId),
        )
        const existing = state.selections.find(
          (selection) => selection.sessionId === sessionId
            && selection.userId === userId
            && selection.itemId === itemId,
        )
        const sel: ItemSelection = existing
          ? {
              ...existing,
              portionPercentage: portion,
              lockedAt: participantLocked ? existing.lockedAt ?? new Date().toISOString() : undefined,
            }
          : {
              id: generateId(),
              sessionId,
              userId,
              itemId,
              portionPercentage: portion,
              lockedAt: participantLocked ? new Date().toISOString() : undefined,
            }
        await dbUpsertSelection(sel)
        set((s) => ({
          selections: existing
            ? s.selections.map((selection) => selection.id === existing.id ? sel : selection)
            : [...s.selections, sel],
        }))
      },

      removeSelection: async (sessionId, userId, itemId) => {
        requireCloudConnection()
        await dbDeleteSelection(sessionId, userId, itemId)
        set((s) => ({
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.userId === userId && sel.itemId === itemId),
          ),
        }))
      },

	      lockUserSelections: async (sessionId, userId) => {
	        requireCloudConnection()
	        const now = new Date().toISOString()
	        await dbLockUserSelections(sessionId, userId, now)
	        set((s) => {
	          let sessionPatch: Partial<Session> | null = null
	          const nextSelections = s.selections.map((sel) =>
	            sel.sessionId === sessionId && sel.userId === userId
	              ? { ...sel, lockedAt: now }
	              : sel,
	          )
	          const sessionItems = s.billItems[sessionId] ?? []
	          const sessionSels = nextSelections.filter((sel) => sel.sessionId === sessionId)

	          const updatedSessions = s.sessions.map((sess) => {
	            if (sess.id !== sessionId) return sess
	            const newLocked = [...new Set([...(sess.lockedParticipantIds ?? []), userId])]
	            const candidate = {
	              ...sess,
	              lockedParticipantIds: newLocked,
	            }
	            const completion = getSessionCompletionState(candidate, sessionItems, sessionSels)

	            if (completion.complete) {
	              const completedAt = sess.completedAt ?? now
	              sessionPatch = { completedAt, status: 'completed' }
	              return { ...candidate, completedAt, status: 'completed' as const }
	            }

	            if (sess.status === 'completed' || sess.completedAt) {
	              sessionPatch = { completedAt: null, status: 'active' }
	              return { ...candidate, completedAt: null, status: 'active' as const }
	            }

	            return candidate
	          })

	          if (sessionPatch) {
	            dbUpdateSession(sessionId, sessionPatch).catch(console.error)
	          }

	          return {
	            sessions: updatedSessions,
	            selections: nextSelections,
	          }
	        })
	      },

	      unlockUserSelections: async (sessionId, userId) => {
	        requireCloudConnection()
	        await dbUnlockUserSelections(sessionId, userId)
	        set((s) => ({
	          sessions: s.sessions.map((sess) => {
	            if (sess.id !== sessionId) return sess
	            const newLocked = (sess.lockedParticipantIds ?? []).filter((id) => id !== userId)
	            // If session was completed but a user is now unlocked, revert it to active so it
	            // appears in the pending section again for all participants.
	            const needsRevert = sess.status === 'completed' || Boolean(sess.completedAt)
	            if (needsRevert) {
	              dbUpdateSession(sessionId, { status: 'active', completedAt: null }).catch(console.error)
	            }
	            return {
	              ...sess,
	              lockedParticipantIds: newLocked,
	              ...(needsRevert ? { status: 'active' as const, completedAt: null } : {}),
	            }
	          }),
          selections: s.selections.map((sel) =>
            sel.sessionId === sessionId && sel.userId === userId
              ? { ...sel, lockedAt: undefined }
              : sel,
          ),
        }))
      },

      getSelections: (sessionId) => get().selections.filter((s) => s.sessionId === sessionId),
      getUserSelections: (sessionId, userId) =>
        get().selections.filter((s) => s.sessionId === sessionId && s.userId === userId),

      // ── Supabase sync helpers ────────────────────────────────────

      hydrateFromSupabase: (users, sessions) => {
        set((s) => {
          // Supabase is the source of truth whenever it is configured.
          const mergedUsers = users
          const mergedSessions = sessions

          // Re-validate currentUser against fresh users list
          const refreshedCurrentUser = s.currentUser
            ? mergedUsers.find((u) => u.id === s.currentUser!.id) ?? s.currentUser
            : null

          return {
            users: mergedUsers,
            sessions: mergedSessions,
            currentUser: refreshedCurrentUser,
            cloudReady: true,
            cloudSyncError: '',
          }
        })
      },

      setCloudSyncState: (ready, error = '') => set({ cloudReady: ready, cloudSyncError: error }),

      hydrateBillItemsFromSupabase: (items) => {
        const billItems = items.reduce<Record<string, BillItem[]>>((grouped, item) => {
          if (!grouped[item.sessionId]) grouped[item.sessionId] = []
          grouped[item.sessionId].push(item)
          return grouped
        }, {})
        set({ billItems })
      },

      hydrateSelectionsFromSupabase: (selections) => {
        set({ selections, selectionsReady: true })
      },

      updateSessionFromRealtime: (sessionId, data) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, ...data } : sess,
          ),
        }))
      },

      setSelectionsForSession: (sessionId, sels) => {
        set((s) => ({
          selections: [
            ...s.selections.filter((x) => x.sessionId !== sessionId),
            ...sels,
          ],
        }))
      },

      updateBillItemFromRealtime: (sessionId, itemId, data) => {
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: (s.billItems[sessionId] ?? []).map((item) =>
              item.id === itemId ? { ...item, ...data } : item,
            ),
          },
        }))
      },

      upsertSelectionFromRealtime: (sel) => {
        set((s) => {
          const existing = s.selections.find(
            (x) => x.sessionId === sel.sessionId && x.userId === sel.userId && x.itemId === sel.itemId,
          )
          if (existing) {
            return { selections: s.selections.map((x) => x === existing ? sel : x) }
          }
          return { selections: [...s.selections, sel] }
        })
      },

      removeSelectionFromRealtime: (sessionId, userId, itemId) => {
        set((s) => ({
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.userId === userId && sel.itemId === itemId),
          ),
        }))
      },

      setParticipantLockFromRealtime: (sessionId, userId, locked) => {
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            const lockedParticipantIds = sess.lockedParticipantIds ?? []
            return {
              ...sess,
              lockedParticipantIds: locked
                ? [...new Set([...lockedParticipantIds, userId])]
                : lockedParticipantIds.filter((id) => id !== userId),
            }
          }),
        }))
      },
}))
