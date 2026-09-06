const SESSION_KEY = '4j-laundry-session'
const resourcePaths = {
  customers: '/api/customers', orders: '/api/orders', inventory_items: '/api/inventory/items',
  inventory_categories: '/api/inventory/categories', inventory_usage_log: '/api/inventory/usage',
  inventory_restocks: '/api/inventory/restocks', expenses: '/api/expenses', staff: '/api/staff',
  settings: '/api/settings', service_types: '/api/service-types', sms_log: '/api/sms-log',
}

export function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
export function storeSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) }
export function clearSession() { localStorage.removeItem(SESSION_KEY) }

export async function apiFetch(path, options = {}) {
  const session = getStoredSession()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const response = await fetch(path, { ...options, headers })
  const data = await response.json().catch(() => ({}))
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
