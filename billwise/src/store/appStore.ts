import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Session, BillItem, ItemSelection } from '../types'
import { generateId, hashPin } from '../services/calculations'
import {
  dbFindUserByPin, dbCreateUser, dbUpdateUserPin, dbDeleteUser,
  dbCreateSession, dbUpdateSession, dbDeleteSession, dbUploadBillImage, dbAddParticipant, dbRemoveParticipant,
  dbSetBillItems, dbUpdateBillItem, dbDeleteBillItem,
  dbUpsertSelection, dbDeleteSelection, dbLockUserSelections, dbUnlockUserSelections,
} from '../lib/db'
import { supabase } from '../lib/supabase'

interface AppStore {
  // Data
  users: User[]
  sessions: Session[]
  billItems: Record<string, BillItem[]>
  selections: ItemSelection[]
  apiKey: string

  // Auth
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  verifyAndLogin: (pin: string) => Promise<User | null>

  // API key (kept for compat, no longer used)
  setApiKey: (key: string) => void

  // User management
  addUser: (name: string, pin: string, role: 'admin' | 'user') => Promise<User>
  updateUserPin: (userId: string, newPin: string) => void
  deleteUser: (userId: string) => void

  // Session management
  createSession: (data: Omit<Session, 'id' | 'orderId' | 'createdAt' | 'participantIds' | 'lockedParticipantIds' | 'status'>) => Promise<Session>
  updateSession: (id: string, data: Partial<Session>) => void
  deleteSession: (id: string) => void
  saveBillImage: (sessionId: string, imageDataUrl: string) => Promise<boolean>
  addParticipant: (sessionId: string, userId: string) => Promise<void>
  removeParticipant: (sessionId: string, userId: string) => void
  lockSession: (sessionId: string) => void

  // Bill items
  setBillItems: (sessionId: string, items: BillItem[]) => Promise<void>
  setBillItemsForSession: (sessionId: string, items: BillItem[]) => void
  addBillItem: (sessionId: string, item: Omit<BillItem, 'id' | 'sessionId'>) => BillItem
  updateBillItem: (sessionId: string, itemId: string, data: Partial<BillItem>) => void
  removeBillItem: (sessionId: string, itemId: string) => void

  // Selections
  setSelection: (sessionId: string, userId: string, itemId: string, portion: number) => void
  removeSelection: (sessionId: string, userId: string, itemId: string) => void
  lockUserSelections: (sessionId: string, userId: string) => void
  unlockUserSelections: (sessionId: string, userId: string) => void
  getSelections: (sessionId: string) => ItemSelection[]
  getUserSelections: (sessionId: string, userId: string) => ItemSelection[]

  // Supabase sync helpers (called by hooks)
  hydrateFromSupabase: (users: User[], sessions: Session[]) => void
  hydrateBillItemsFromSupabase: (items: BillItem[]) => void
  updateSessionFromRealtime: (sessionId: string, data: Partial<Session>) => void
  setSelectionsForSession: (sessionId: string, sels: ItemSelection[]) => void
  updateBillItemFromRealtime: (sessionId: string, itemId: string, data: Partial<BillItem>) => void
  upsertSelectionFromRealtime: (sel: ItemSelection) => void
  removeSelectionFromRealtime: (sessionId: string, userId: string, itemId: string) => void
  setParticipantLockFromRealtime: (sessionId: string, userId: string, locked: boolean) => void
}

const SEED_USERS: User[] = [
  { id: 'admin-1', name: 'Admin', pin: hashPin('1234'), role: 'admin', createdAt: new Date().toISOString() },
]

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      users: SEED_USERS,
      sessions: [],
      billItems: {},
      selections: [],
      apiKey: '',
      currentUser: null,

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
        const user: User = {
          id: generateId(),
          name,
          pin: hashPin(pin),
          role,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ users: [...s.users, user] }))
        await dbCreateUser(user)
        return user
      },

      updateUserPin: (userId, newPin) => {
        const hashed = hashPin(newPin)
        set((s) => ({
          users: s.users.map((u) => u.id === userId ? { ...u, pin: hashed } : u),
        }))
        dbUpdateUserPin(userId, hashed)
      },

      deleteUser: (userId) => {
        set((s) => ({
          users: s.users.filter((u) => u.id !== userId),
          sessions: s.sessions.map((sess) => ({
            ...sess,
            participantIds: sess.participantIds.filter((id) => id !== userId),
            lockedParticipantIds: (sess.lockedParticipantIds ?? []).filter((id) => id !== userId),
          })),
          selections: s.selections.filter((sel) => sel.userId !== userId),
        }))
        dbDeleteUser(userId)
      },

      createSession: async (data) => {
        const session: Session = {
          ...data,
          id: generateId(),
          orderId: Array.from({ length: 8 }, () =>
            'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
          ).join(''),
          status: 'active',
          isPublic: true,
          participantIds: [],
          lockedParticipantIds: [],
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ sessions: [...s.sessions, session] }))
        await dbCreateSession(session)
        return session
      },

      updateSession: (id, data) => {
        set((s) => ({
          sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, ...data } : sess),
        }))
        dbUpdateSession(id, data)
      },

      deleteSession: (id) => {
        set((s) => {
          const billItems = { ...s.billItems }
          delete billItems[id]
          return {
            sessions: s.sessions.filter((sess) => sess.id !== id),
            billItems,
            selections: s.selections.filter((sel) => sel.sessionId !== id),
          }
        })
        dbDeleteSession(id)
      },

      saveBillImage: async (sessionId, imageDataUrl) => {
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
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId && !sess.participantIds.includes(userId)
              ? { ...sess, participantIds: [...sess.participantIds, userId] }
              : sess,
          ),
        }))
        await dbAddParticipant(sessionId, userId)
      },

      removeParticipant: (sessionId, userId) => {
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
        dbRemoveParticipant(sessionId, userId)
      },

      lockSession: (sessionId) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, status: 'locked' } : sess,
          ),
        }))
        dbUpdateSession(sessionId, { status: 'locked' })
      },

      setBillItems: async (sessionId, items) => {
        set((s) => ({ billItems: { ...s.billItems, [sessionId]: items } }))
        await dbSetBillItems(sessionId, items)
      },

      setBillItemsForSession: (sessionId, items) => {
        set((s) => ({ billItems: { ...s.billItems, [sessionId]: items } }))
      },

      addBillItem: (sessionId, item) => {
        const newItem: BillItem = { ...item, id: generateId(), sessionId }
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: [...(s.billItems[sessionId] ?? []), newItem],
          },
        }))
        return newItem
      },

      updateBillItem: (sessionId, itemId, data) => {
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: (s.billItems[sessionId] ?? []).map((item) =>
              item.id === itemId ? { ...item, ...data } : item,
            ),
          },
        }))
        dbUpdateBillItem(itemId, data)
      },

      removeBillItem: (sessionId, itemId) => {
        set((s) => ({
          billItems: {
            ...s.billItems,
            [sessionId]: (s.billItems[sessionId] ?? []).filter((i) => i.id !== itemId),
          },
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.itemId === itemId),
          ),
        }))
        dbDeleteBillItem(itemId)
      },

      setSelection: (sessionId, userId, itemId, portion) => {
        let sel: ItemSelection | undefined
        set((s) => {
          const participantLocked = s.sessions.some((session) =>
            session.id === sessionId && (session.lockedParticipantIds ?? []).includes(userId),
          )
          const existing = s.selections.find(
            (x) => x.sessionId === sessionId && x.userId === userId && x.itemId === itemId,
          )
          if (existing) {
            sel = {
              ...existing,
              portionPercentage: portion,
              lockedAt: participantLocked ? existing.lockedAt ?? new Date().toISOString() : undefined,
            }
            return {
              selections: s.selections.map((x) => x === existing ? sel! : x),
            }
          }
          sel = {
            id: generateId(),
            sessionId,
            userId,
            itemId,
            portionPercentage: portion,
            lockedAt: participantLocked ? new Date().toISOString() : undefined,
          }
          return { selections: [...s.selections, sel] }
        })
        if (sel) dbUpsertSelection(sel)
      },

      removeSelection: (sessionId, userId, itemId) => {
        set((s) => ({
          selections: s.selections.filter(
            (sel) => !(sel.sessionId === sessionId && sel.userId === userId && sel.itemId === itemId),
          ),
        }))
        dbDeleteSelection(sessionId, userId, itemId)
      },

      lockUserSelections: (sessionId, userId) => {
        const now = new Date().toISOString()
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId && !(sess.lockedParticipantIds ?? []).includes(userId)
              ? { ...sess, lockedParticipantIds: [...(sess.lockedParticipantIds ?? []), userId] }
              : sess,
          ),
          selections: s.selections.map((sel) =>
            sel.sessionId === sessionId && sel.userId === userId
              ? { ...sel, lockedAt: now }
              : sel,
          ),
        }))
        dbLockUserSelections(sessionId, userId, now)
      },

      unlockUserSelections: (sessionId, userId) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  lockedParticipantIds: (sess.lockedParticipantIds ?? []).filter((id) => id !== userId),
                }
              : sess,
          ),
          selections: s.selections.map((sel) =>
            sel.sessionId === sessionId && sel.userId === userId
              ? { ...sel, lockedAt: undefined }
              : sel,
          ),
        }))
        dbUnlockUserSelections(sessionId, userId)
      },

      getSelections: (sessionId) => get().selections.filter((s) => s.sessionId === sessionId),
      getUserSelections: (sessionId, userId) =>
        get().selections.filter((s) => s.sessionId === sessionId && s.userId === userId),

      // ── Supabase sync helpers ────────────────────────────────────

      hydrateFromSupabase: (users, sessions) => {
        set((s) => {
          // Merge: Supabase is source of truth for users/sessions, but keep local admin seed
          const mergedUsers = users.length ? users : s.users
          const mergedSessions = sessions

          // Re-validate currentUser against fresh users list
          const refreshedCurrentUser = s.currentUser
            ? mergedUsers.find((u) => u.id === s.currentUser!.id) ?? s.currentUser
            : null

          return { users: mergedUsers, sessions: mergedSessions, currentUser: refreshedCurrentUser }
        })
      },

      hydrateBillItemsFromSupabase: (items) => {
        const billItems = items.reduce<Record<string, BillItem[]>>((grouped, item) => {
          if (!grouped[item.sessionId]) grouped[item.sessionId] = []
          grouped[item.sessionId].push(item)
          return grouped
        }, {})
        set({ billItems })
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
    }),
    {
      name: 'billwise-store',
      partialize: (state) => ({
        users: state.users,
        sessions: state.sessions,
        billItems: state.billItems,
        selections: state.selections,
        apiKey: state.apiKey,
      }),
    },
  ),
)
