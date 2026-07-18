/**
 * Hydrates the currently opened session with its detailed rows and receipt
 * Storage path. Ongoing changes are handled by useSupabaseInit's targeted
 * Realtime payload handlers, so this hook does not create duplicate channels.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbGetBillItems, dbGetSelections, dbGetSessionBillImagePath } from '../lib/db'
import { useAppStore } from '../store/appStore'

export function useSessionSync(sessionId: string | undefined) {
  const { setSelectionsForSession, setBillItemsForSession, updateSessionFromRealtime } = useAppStore()

  useEffect(() => {
    if (!sessionId || !supabase) return
    let cancelled = false

    void Promise.all([
      dbGetSelections(sessionId),
      dbGetBillItems(sessionId),
      dbGetSessionBillImagePath(sessionId),
    ]).then(([selections, items, billImageUrl]) => {
      if (cancelled) return
      setSelectionsForSession(sessionId, selections)
      setBillItemsForSession(sessionId, items)
      if (billImageUrl) updateSessionFromRealtime(sessionId, { billImageUrl })
    }).catch((error) => {
      console.error('[sessionSync]', error)
    })

    return () => {
      cancelled = true
    }
  }, [sessionId])
}
