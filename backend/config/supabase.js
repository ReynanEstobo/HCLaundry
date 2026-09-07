import { createClient } from '@supabase/supabase-js'

let runtimeEnv = null

// Cloudflare Workers provide secrets per request through `env`, while the
// local Node server reads them from `.env`. Keeping this accessor lazy lets
// both runtimes use the same service layer without shipping any secret to the
// browser bundle.
export function configureRuntimeEnv(env) {
  runtimeEnv = env || null
}

export function runtimeValue(name) {
  return runtimeEnv?.[name] || process.env?.[name]
}

function databaseClient() {
  const url = runtimeValue('SUPABASE_URL')
  const serviceRoleKey = runtimeValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw Object.assign(new Error('Supabase server configuration is incomplete.'), { status: 500 })
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

function authBrowserClient() {
  const url = runtimeValue('SUPABASE_URL')
  const anonKey = runtimeValue('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw Object.assign(new Error('Supabase authentication configuration is incomplete.'), { status: 500 })
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const database = {
  from: (...args) => databaseClient().from(...args),
  rpc: (...args) => databaseClient().rpc(...args),
  get auth() { return databaseClient().auth },
}

export const authClient = {
  get auth() { return authBrowserClient().auth },
}
