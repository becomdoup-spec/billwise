/**
 * Runs once on app start — loads users and sessions from Supabase
 * and hydrates the local Zustand store.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbGetUsers, dbGetSessions, dbGetAllBillItems } from '../lib/db'
import { useAppStore } from '../store/appStore'

export function useSupabaseInit() {
  const { hydrateFromSupabase, hydrateBillItemsFromSupabase, setCloudSyncState } = useAppStore()

  useEffect(() => {
    // Remove data persisted by older builds. Supabase is the source of truth.
    window.localStorage.removeItem('billwise-store')
    if (!supabase) return
    const client = supabase
    let refreshVersion = 0

    const refresh = async () => {
      const version = ++refreshVersion
      try {
        const [users, sessions, items] = await Promise.all([dbGetUsers(), dbGetSessions(), dbGetAllBillItems()])
        if (version !== refreshVersion) return
        hydrateFromSupabase(users, sessions)
        hydrateBillItemsFromSupabase(items)
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
      .subscribe()

    const refreshTimer = window.setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)

    return () => {
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refresh)
      client.removeChannel(channel)
    }
  }, [])
}
