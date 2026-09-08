const SESSION_KEY = 'ic-laundry-session'
const LEGACY_SESSION_KEY = 'hc-laundry-session'
const sessionListeners = new Set()
let expiryTimer

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY) || 'null') }
  catch { return null }
}

export function sessionExpiry(session) {
  const expiresAt = Number(session?.expires_at)
  if (expiresAt > 0) return expiresAt * 1000
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const exp = Number(JSON.parse(atob(payload)).exp)
    return exp > 0 ? exp * 1000 : 0
  } catch { return 0 }
}

function scheduleExpiry(session) {
  clearTimeout(expiryTimer)
  if (session) expiryTimer = setTimeout(() => {
    const current = getStoredSession()
    if (current) scheduleExpiry(current)
  }, Math.min(Math.max(0, sessionExpiry(session) - Date.now()), 2147483647))
}

function notifySession(session) {
  scheduleExpiry(session)
  sessionListeners.forEach(listener => listener(session))
}

export function onSessionChange(listener) {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

// Timers may pause on sleeping devices. Recheck when the tab becomes active,
// and synchronize sign-outs/session replacements across browser tabs.
export function startSessionMonitor() {
  const check = () => notifySession(getStoredSession())
  const storage = event => {
    if (!event.key || [SESSION_KEY, LEGACY_SESSION_KEY].includes(event.key)) check()
  }
  window.addEventListener('storage', storage)
  window.addEventListener('focus', check)
  window.addEventListener('pageshow', check)
  document.addEventListener('visibilitychange', check)
  scheduleExpiry(getStoredSession())
  return () => {
    clearTimeout(expiryTimer)
    window.removeEventListener('storage', storage)
    window.removeEventListener('focus', check)
    window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', check)
  }
}
const resourcePaths = {
  customers: '/api/customers', orders: '/api/orders', inventory_items: '/api/inventory/items',
  inventory_categories: '/api/inventory/categories', inventory_usage_log: '/api/inventory/usage',
  inventory_restocks: '/api/inventory/restocks', expenses: '/api/expenses', staff: '/api/staff',
  settings: '/api/settings', service_types: '/api/service-types', sms_log: '/api/sms-log',
}

export function getStoredSession() {
  try {
    const session = readSession()
    if (session && (!session.access_token || sessionExpiry(session) <= Date.now())) {
      clearSession()
      return null
    }
    if (session && !localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  } catch { return null }
}
export function storeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  localStorage.removeItem(LEGACY_SESSION_KEY)
  notifySession(getStoredSession())
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(LEGACY_SESSION_KEY)
  notifySession(null)
}

export async function apiFetch(path, options = {}) {
  const publicRequest = /^\/api\/(public\/|auth\/(login|forgot-password|reset-password)(?:\/|$))/.test(path)
  const session = publicRequest ? null : getStoredSession()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const response = await fetch(path, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  // An older request must not sign out a newly replaced password-change or
  // login session. Permission errors (403) and network failures are not expiry.
  if (response.status === 401 && session?.access_token === readSession()?.access_token && session) clearSession()
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { response, data })
  return data
}

export async function runQuery(table, request) {
  if (!getStoredSession() && table === 'orders' && request.operation === 'select') {
    const filter = request.filters?.find(item => item.type === 'ilike' && item.column === 'order_number')
    if (!filter) return { data: null, error: { message: 'Authentication required' } }
    const data = await apiFetch(`/api/public/orders/track?q=${encodeURIComponent(String(filter.value).replaceAll('%', ''))}`)
    return { data: data.data, error: null, count: data.data?.length }
  }
  if (!getStoredSession() && table === 'settings' && request.operation === 'select') {
    const data = await apiFetch('/api/public/settings')
    return { data: data.data, error: null }
  }
  try { return await apiFetch(resourcePaths[table], { method: 'POST', body: JSON.stringify(request) }) }
  catch (error) { return { data: null, error: { message: error.message }, count: null } }
}
