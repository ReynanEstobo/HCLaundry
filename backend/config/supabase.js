import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !serviceRoleKey || !anonKey) {
  console.warn('Supabase configuration is incomplete. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.')
}

export const database = createClient(url || 'http://localhost', serviceRoleKey || 'missing-key', {
  auth: { autoRefreshToken: false, persistSession: false },
})

export const authClient = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: { autoRefreshToken: false, persistSession: false },
})
