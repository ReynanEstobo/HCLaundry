import { useEffect } from 'react'
import { supabase } from './supabase'

/**
 * Subscribe to realtime changes on one or more Supabase tables.
 * Calls `onChanged` whenever an INSERT, UPDATE, or DELETE happens.
 *
 * @param {string[]} tables - Array of table names to watch
 * @param {Function} onChanged - Callback invoked on any change
 */
export function useRealtime(tables, onChanged) {
  useEffect(() => {
    if (!tables || tables.length === 0 || !onChanged) return

    const channelName = `realtime-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`
    let channel = supabase.channel(channelName)

    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChanged()
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tables.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}
