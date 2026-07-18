/**
 * Loads the active group's Supabase data once, then applies small Realtime
 * payloads directly to the local store. A throttled focus refresh provides a
 * recovery path without continuously polling the database.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  dbGetAppSettings,
  dbGetBillItemsForSessions,
  dbGetGroupById,
  dbGetSelectionsForSessions,
  dbGetSessions,
  dbGetUsers,
  dbUpdateSession,
  rowToItem,
  rowToSelection,
  rowToSession,
  rowToUser,
} from '../lib/db'
import { useAppStore } from '../store/appStore'
import { isSessionComplete } from '../services/calculations'
import type { BillItem, ItemSelection } from '../types'

const APP_SETTING_KEYS = ['require_pin', 'show_completed_bills', 'default_theme']
const FOCUS_REFRESH_INTERVAL_MS = 60_000

function rowBelongsToGroup(row: Record<string, unknown>, groupId: string | null) {
  return ((row.group_id as string | null | undefined) ?? null) === groupId
}

export function useSupabaseInit() {
  const {
    hydrateFromSupabase,
    hydrateBillItemsFromSupabase,
    hydrateSelectionsFromSupabase,
    hydrateRequirePin,
    hydrateShowCompletedBills,
    hydrateDefaultTheme,
    hydrateActiveGroup,
    setCloudSyncState,
  } = useAppStore()
  const activeGroupId = useAppStore((state) => state.activeGroupId)

  useEffect(() => {
    // Remove data persisted by older builds. Supabase is the source of truth.
    window.localStorage.removeItem('billwise-store')
    if (!supabase) return
    const client = supabase
    let disposed = false
    let refreshVersion = 0
    let lastRefreshAt = 0
    let channel: ReturnType<typeof client.channel> | null = null

    // Resolve the active group row once for display (name, invite link).
    if (activeGroupId) {
      dbGetGroupById(activeGroupId).then((group) => {
        if (useAppStore.getState().activeGroupId !== activeGroupId) return
        if (group) hydrateActiveGroup(group)
        else useAppStore.getState().setActiveGroup(null)
      }).catch(() => undefined)
    } else {
      hydrateActiveGroup(null)
    }

    const refresh = async () => {
      const version = ++refreshVersion
      try {
        const [users, sessions, settings] = await Promise.all([
          dbGetUsers(activeGroupId),
          dbGetSessions(activeGroupId),
          dbGetAppSettings(APP_SETTING_KEYS),
        ])
        const sessionIds = sessions.map((session) => session.id)
        const [items, selections] = await Promise.all([
          dbGetBillItemsForSessions(sessionIds),
          dbGetSelectionsForSessions(sessionIds),
        ])
        if (disposed || version !== refreshVersion) return

        hydrateFromSupabase(users, sessions)
        hydrateBillItemsFromSupabase(items)
        if (settings.require_pin !== undefined) hydrateRequirePin(settings.require_pin !== 'false')
        if (settings.show_completed_bills !== undefined) hydrateShowCompletedBills(settings.show_completed_bills !== 'false')
        if (settings.default_theme !== undefined) hydrateDefaultTheme(settings.default_theme)
        // Keep this last: selectionsReady means every split input is hydrated.
        hydrateSelectionsFromSupabase(selections)
        lastRefreshAt = Date.now()

        // Auto-revert sessions that are marked "completed" in the DB but are
        // no longer fully locked and allocated.
        const itemsBySession = items.reduce<Record<string, BillItem[]>>((acc, item) => {
          ;(acc[item.sessionId] ??= []).push(item)
          return acc
        }, {})
        const selsBySession = selections.reduce<Record<string, ItemSelection[]>>((acc, selection) => {
          ;(acc[selection.sessionId] ??= []).push(selection)
          return acc
        }, {})
        sessions
          .filter((session) => session.status === 'completed')
          .forEach((session) => {
            const trulyDone = isSessionComplete(
              session,
              itemsBySession[session.id] ?? [],
              selsBySession[session.id] ?? [],
            )
            if (!trulyDone) {
              dbUpdateSession(session.id, { status: 'active', completedAt: null }).catch(console.error)
            }
          })
      } catch (error) {
        if (disposed || version !== refreshVersion) return
        const message = error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : 'Could not connect to Supabase'
        setCloudSyncState(true, message)
      }
    }

    const startRealtime = () => {
      channel = client
        .channel(`app-data-sync-${activeGroupId ?? 'legacy'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
          const state = useAppStore.getState()
          if (payload.eventType === 'DELETE') {
            state.removeUserFromRealtime((payload.old as Record<string, unknown>).id as string)
            return
          }
          const row = payload.new as Record<string, unknown>
          const user = rowToUser(row)
          if (rowBelongsToGroup(row, activeGroupId)) state.upsertUserFromRealtime(user)
          else state.removeUserFromRealtime(user.id)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
          const state = useAppStore.getState()
          if (payload.eventType === 'DELETE') {
            state.removeSessionFromRealtime((payload.old as Record<string, unknown>).id as string)
            return
          }
          const row = payload.new as Record<string, unknown>
          const existing = state.sessions.find((session) => session.id === row.id)
          const session = rowToSession(
            row,
            existing?.participantIds ?? [],
            existing?.lockedParticipantIds ?? [],
          )
          if (rowBelongsToGroup(row, activeGroupId)) state.upsertSessionFromRealtime(session)
          else state.removeSessionFromRealtime(session.id)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants' }, (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>
          const sessionId = row.session_id as string
          const state = useAppStore.getState()
          if (!state.sessions.some((session) => session.id === sessionId)) return
          state.setParticipantFromRealtime(
            sessionId,
            row.user_id as string,
            payload.eventType !== 'DELETE',
            Boolean(row.locked_at),
          )
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_items' }, (payload) => {
          const state = useAppStore.getState()
          if (payload.eventType === 'DELETE') {
            const row = payload.old as Record<string, unknown>
            const itemId = row.id as string
            const sessionId = (row.session_id as string | undefined)
              ?? Object.entries(state.billItems).find(([, items]) => items.some((item) => item.id === itemId))?.[0]
            if (sessionId) state.removeBillItemFromRealtime(sessionId, itemId)
            return
          }
          const item = rowToItem(payload.new as Record<string, unknown>)
          if (state.sessions.some((session) => session.id === item.sessionId)) {
            state.upsertBillItemFromRealtime(item)
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'item_selections' }, (payload) => {
          const state = useAppStore.getState()
          if (payload.eventType === 'DELETE') {
            const row = payload.old as Record<string, unknown>
            if (!state.sessions.some((session) => session.id === row.session_id)) return
            state.removeSelectionFromRealtime(
              row.session_id as string,
              row.user_id as string,
              row.item_id as string,
            )
            return
          }
          const selection = rowToSelection(payload.new as Record<string, unknown>)
          if (state.sessions.some((session) => session.id === selection.sessionId)) {
            state.upsertSelectionFromRealtime(selection)
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new as Record<string, unknown>
          const value = String(row.value ?? '')
          const state = useAppStore.getState()
          if (row.key === 'require_pin') state.hydrateRequirePin(value !== 'false')
          if (row.key === 'show_completed_bills') state.hydrateShowCompletedBills(value !== 'false')
          if (row.key === 'default_theme') state.hydrateDefaultTheme(value)
        })
        .subscribe()
    }

    void refresh().then(() => {
      if (!disposed) startRealtime()
    })

    const refreshOnFocus = () => {
      if (Date.now() - lastRefreshAt >= FOCUS_REFRESH_INTERVAL_MS) void refresh()
    }
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      disposed = true
      refreshVersion++
      window.removeEventListener('focus', refreshOnFocus)
      if (channel) void client.removeChannel(channel)
    }
  }, [activeGroupId])
}
