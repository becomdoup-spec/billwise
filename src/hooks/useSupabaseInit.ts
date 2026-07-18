/**
 * Runs on app start and whenever the active group changes — loads the
 * group-scoped users and sessions from Supabase and hydrates the store.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbGetUsers, dbGetSessions, dbGetAllBillItems, dbGetAllSelections, dbGetAppSetting, dbGetGroupById, dbUpdateSession } from '../lib/db'
import { useAppStore } from '../store/appStore'
import { isSessionComplete } from '../services/calculations'
import type { BillItem, ItemSelection } from '../types'

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
    let refreshVersion = 0

    // Resolve the active group row once for display (name, invite link).
    if (activeGroupId) {
      dbGetGroupById(activeGroupId).then((group) => {
        if (useAppStore.getState().activeGroupId !== activeGroupId) return
        if (group) hydrateActiveGroup(group)
        else useAppStore.getState().setActiveGroup(null) // deleted or migration missing → shared space
      }).catch(() => undefined)
    } else {
      hydrateActiveGroup(null)
    }

    const refresh = async () => {
      const version = ++refreshVersion
      try {
        const [users, sessions, items, selections, requirePinVal, showCompletedVal, defaultThemeVal] = await Promise.all([
          dbGetUsers(activeGroupId),
          dbGetSessions(activeGroupId),
          dbGetAllBillItems(),
          dbGetAllSelections(),
          dbGetAppSetting('require_pin'),
          dbGetAppSetting('show_completed_bills'),
          dbGetAppSetting('default_theme'),
        ])
        if (version !== refreshVersion) return
        // Bill items and selections carry no group column — scope them via the
        // group's session ids so a group only ever sees its own bill data.
        const sessionIds = new Set(sessions.map((s) => s.id))
        const scopedItems = items.filter((item) => sessionIds.has(item.sessionId))
        const scopedSelections = selections.filter((sel) => sessionIds.has(sel.sessionId))
        hydrateFromSupabase(users, sessions)
        hydrateBillItemsFromSupabase(scopedItems)
        if (requirePinVal !== null) hydrateRequirePin(requirePinVal !== 'false')
        if (showCompletedVal !== null) hydrateShowCompletedBills(showCompletedVal !== 'false')
        if (defaultThemeVal !== null) hydrateDefaultTheme(defaultThemeVal)
        // Keep this last: selectionsReady means every split input is hydrated.
        hydrateSelectionsFromSupabase(scopedSelections)

        // Auto-revert sessions that are marked "completed" in the DB but are
        // no longer fully locked and allocated.
        const itemsBySession = scopedItems.reduce<Record<string, BillItem[]>>((acc, item) => {
          ;(acc[item.sessionId] ??= []).push(item)
          return acc
        }, {})
        const selsBySession = scopedSelections.reduce<Record<string, ItemSelection[]>>((acc, sel) => {
          ;(acc[sel.sessionId] ??= []).push(sel)
          return acc
        }, {})
        sessions
          .filter((s) => s.status === 'completed')
          .forEach((s) => {
            const trulyDone = isSessionComplete(s, itemsBySession[s.id] ?? [], selsBySession[s.id] ?? [])
            if (!trulyDone) {
              dbUpdateSession(s.id, { status: 'active', completedAt: null }).catch(console.error)
            }
          })
      } catch (error) {
        if (version !== refreshVersion) return
        const message = error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : 'Could not connect to Supabase'
        setCloudSyncState(true, message)
      }
    }

    refresh()

    const channel = client
      .channel('app-data-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_selections' }, refresh)
      .subscribe()

    const refreshTimer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)

    return () => {
      refreshVersion++ // invalidate in-flight refreshes from the previous scope
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refresh)
      client.removeChannel(channel)
    }
  }, [activeGroupId])
}
