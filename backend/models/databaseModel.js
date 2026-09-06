import { database } from '../config/supabase.js'

// This is intentionally a whitelist: it preserves existing Supabase query shapes
// while preventing the browser from selecting arbitrary database tables.
export const TABLES = new Set([
  'customers', 'orders', 'inventory_items', 'inventory_categories',
  'inventory_usage_log', 'inventory_restocks', 'expenses', 'staff',
  'settings', 'service_types', 'sms_log',
])

function applyFilters(query, filters = []) {
  return filters.reduce((current, { type, column, value }) => {
    if (!column) return current
    if (type === 'eq') return current.eq(column, value)
    if (type === 'gte') return current.gte(column, value)
    if (type === 'lte') return current.lte(column, value)
    if (type === 'ilike') return current.ilike(column, value)
    if (type === 'in') return current.in(column, value)
    if (type === 'not') return current.not(column, value?.operator, value?.value)
    return current
  }, query)
}

export async function execute(table, request) {
  if (!TABLES.has(table)) throw Object.assign(new Error('Unknown resource'), { status: 404 })
  const { operation, selection = '*', filters, orders = [], range, limit, payload, count, single, returning } = request
  let query = database.from(table)

  if (operation === 'select') query = query.select(selection, count ? { count } : undefined)
  if (operation === 'insert') query = query.insert(payload)
  if (operation === 'update') query = query.update(payload)
  if (operation === 'delete') query = query.delete()
  query = applyFilters(query, filters)
  if (operation !== 'select' && returning) query = query.select(selection)
  orders.forEach(({ column, options }) => { query = query.order(column, options) })
  if (range) query = query.range(range.from, range.to)
  if (limit) query = query.limit(limit)
  if (single === 'single') query = query.single()
  if (single === 'maybeSingle') query = query.maybeSingle()

  const result = await query
  return { data: result.data, error: result.error, count: result.count }
}

export async function getStaffProfile(authId) {
  return database.from('staff').select('role, full_name, branch').eq('auth_id', authId).maybeSingle()
}
