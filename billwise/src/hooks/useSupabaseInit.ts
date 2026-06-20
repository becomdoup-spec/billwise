/**
 * Runs once on app start — loads users and sessions from Supabase
 * and hydrates the local Zustand store.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbGetUsers, dbGetSessions, dbGetAllBillItems } from '../lib/db'
import { useAppStore } from '../store/appStore'

export function useSupabaseInit() {
  const { hydrateFromSupabase, hydrateBillItemsFromSupabase } = useAppStore()

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let refreshVersion = 0

    const refresh = () => {
      const version = ++refreshVersion
      Promise.all([dbGetUsers(), dbGetSessions(), dbGetAllBillItems()]).then(([users, sessions, items]) => {
        if (version !== refreshVersion) return
        hydrateFromSupabase(users, sessions)
        hydrateBillItemsFromSupabase(items)
      })
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
