/**
 * Subscribes to Supabase Realtime for a session.
 * Keeps item_selections and session status in sync across all devices.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbGetSelections, dbGetBillItems, rowToSelection } from '../lib/db'
import { useAppStore } from '../store/appStore'

export function useSessionSync(sessionId: string | undefined) {
  const { setSelectionsForSession, setBillItemsForSession } = useAppStore()

  useEffect(() => {
    if (!sessionId || !supabase) return

    // Initial load from DB
    dbGetSelections(sessionId).then((sels) => {
      setSelectionsForSession(sessionId, sels)
    })
    dbGetBillItems(sessionId).then((items) => {
      setBillItemsForSession(sessionId, items)
    })

    // Realtime: item_selections changes
    const selChannel = supabase
      .channel(`session-selections-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_selections', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const sel = rowToSelection(payload.new as Record<string, unknown>)
            useAppStore.getState().upsertSelectionFromRealtime(sel)
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { session_id: string; user_id: string; item_id: string }
            useAppStore.getState().removeSelectionFromRealtime(old.session_id, old.user_id, old.item_id)
          }
        },
      )
      .subscribe()

    // Realtime: session status changes (locked/unlocked by admin)
    const sessChannel = supabase
      .channel(`session-status-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          useAppStore.getState().updateSessionFromRealtime(sessionId, {
            status: r.status as 'active' | 'locked' | 'completed',
            isPublic: Boolean(r.is_public),
            billImageUrl: r.bill_image_url as string | undefined,
            totalAmount: Number(r.total_amount),
          })
        },
      )
      .subscribe()

    // Realtime: participant lock state, including users with no selections
    const participantChannel = supabase
      .channel(`session-participants-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          useAppStore.getState().setParticipantLockFromRealtime(
            sessionId,
            r.user_id as string,
            Boolean(r.locked_at),
          )
        },
      )
      .subscribe()

    // Realtime: bill_items edits by admin
    const itemsChannel = supabase
      .channel(`session-items-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bill_items', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          useAppStore.getState().updateBillItemFromRealtime(sessionId, r.id as string, {
            name: r.name as string,
            unitPrice: Number(r.unit_price),
            totalPrice: Number(r.total_price),
            quantity: Number(r.quantity),
          })
        },
      )
      .subscribe()

    return () => {
      supabase!.removeChannel(selChannel)
      supabase!.removeChannel(sessChannel)
      supabase!.removeChannel(participantChannel)
      supabase!.removeChannel(itemsChannel)
    }
  }, [sessionId])
}
