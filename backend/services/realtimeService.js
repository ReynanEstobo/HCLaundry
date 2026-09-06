import { EventEmitter } from 'node:events'

// Mutations pass through this process, so connected clients retain the existing
// refresh-on-change behavior without direct browser access to Supabase.
export const events = new EventEmitter()
events.setMaxListeners(100)
