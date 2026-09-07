import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Subscribe to realtime changes on one or more Supabase tables.
 * Calls `onChanged` whenever an INSERT, UPDATE, or DELETE happens.
 *
 * @param {string[]} tables - Array of table names to watch
 * @param {Function} onChanged - Callback invoked on any change
 */
export function useRealtime(tables, onChanged) {
  const refreshTimer = useRef(null)
  const onChangedRef = useRef(onChanged)

  // Keep the subscription stable while always using the current page/filter
  // state in its refresh callback.
  useEffect(() => {
    onChangedRef.current = onChanged
  }, [onChanged])

  useEffect(() => {
    if (!tables || tables.length === 0 || !onChanged) return

    const channelName = `realtime-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`
    let channel = supabase.channel(channelName)

    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // A single action may write to multiple related rows (for example,
          // an order, its history, and inventory usage). Wait briefly so the
          // page performs one background refresh after the transaction settles.
          if (refreshTimer.current) clearTimeout(refreshTimer.current)
          refreshTimer.current = setTimeout(() => onChangedRef.current?.(), 250)
        }
      )
    })

    channel.subscribe()

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [tables.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}
