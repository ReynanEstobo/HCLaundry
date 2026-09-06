import { database } from '../config/supabase.js'

// This is intentionally a whitelist: it preserves existing Supabase query shapes
// while preventing the browser from selecting arbitrary database tables.
export const TABLES = new Set([
  'customers', 'orders', 'inventory_items', 'inventory_categories',
  'inventory_usage_log', 'inventory_restocks', 'expenses', 'staff',
  'settings', 'service_types', 'sms_log', 'branches', 'payments', 'ai_forecasts',
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

<<<<<<< HEAD
// Operational data must never cross a staff member's assigned branch. Branch
// lookup/assignment is always performed on the server, not trusted from UI data.
const BRANCH_SCOPED_TABLES = new Set([
  'orders', 'customers', 'inventory_items', 'inventory_usage_log',
  'inventory_restocks', 'expenses',
])
=======
const BRANCH_SCOPED_TABLES = new Set(['orders', 'customers'])
>>>>>>> 728e40e (Fixed)

function restrictStaffBranchRequest(table, request, identity) {
  if (identity.role === 'admin') return request
  if (identity.role !== 'staff') throw Object.assign(new Error('This account has no staff profile. Contact an administrator to assign a role and branch.'), { status: 403 })
  if (!identity.staffId || !identity.branch) throw Object.assign(new Error(`Your staff account must be assigned to a branch before you can access ${table}.`), { status: 403 })

  const scoped = { ...request, filters: [...(request.filters || []), { type: 'eq', column: 'branch', value: identity.branch }] }
  const applyBranch = payload => ({
    ...payload,
    branch: identity.branch,
    ...(identity.branchId ? { branch_id: identity.branchId } : {}),
  })

  if (request.operation === 'insert') {
<<<<<<< HEAD
    const applyInsert = payload => ({
      ...applyBranch(payload),
      ...(['orders', 'customers'].includes(table) ? { created_by_staff_id: identity.staffId } : {}),
    })
=======
    const applyInsert = payload => ({ ...applyBranch(payload), created_by_staff_id: identity.staffId })
>>>>>>> 728e40e (Fixed)
    scoped.payload = Array.isArray(request.payload) ? request.payload.map(applyInsert) : applyInsert(request.payload || {})
  }
  if (request.operation === 'update') {
    const { created_by_staff_id, ...updates } = request.payload || {}
<<<<<<< HEAD
    scoped.payload = table === 'orders'
      ? { ...applyBranch(updates), last_updated_by_staff_id: identity.staffId }
      : applyBranch(updates)
=======
    scoped.payload = applyBranch(updates)
>>>>>>> 728e40e (Fixed)
  }
  return scoped
}

<<<<<<< HEAD
async function attachAdminBranch(table, request, identity) {
=======
async function attachAdminBranch(table, request) {
>>>>>>> 728e40e (Fixed)
  if (!['insert', 'update'].includes(request.operation)) return request

  async function resolveBranch(payload) {
    // Payment/status-only updates retain the order's existing branch.
    if (!payload?.branch) {
      if (request.operation === 'insert') {
<<<<<<< HEAD
        throw Object.assign(new Error(`Administrators must assign a branch when creating ${table.replaceAll('_', ' ')} records.`), { status: 400 })
      }
      return table === 'orders' ? { ...payload, last_updated_by_staff_id: identity.staffId } : payload
    }
    const { data: branch, error } = await database.from('branches').select('id, name').eq('name', payload.branch).maybeSingle()
    if (error || !branch) throw Object.assign(new Error('The selected branch does not exist.'), { status: 400 })
    return { ...payload, branch: branch.name, branch_id: branch.id, ...(table === 'orders' && request.operation === 'update' ? { last_updated_by_staff_id: identity.staffId } : {}) }
=======
        throw Object.assign(new Error(`Administrators must assign a branch when creating a ${table === 'orders' ? 'order' : 'customer'}.`), { status: 400 })
      }
      return payload
    }
    const { data: branch, error } = await database.from('branches').select('id, name').eq('name', payload.branch).maybeSingle()
    if (error || !branch) throw Object.assign(new Error('The selected branch does not exist.'), { status: 400 })
    return { ...payload, branch: branch.name, branch_id: branch.id }
>>>>>>> 728e40e (Fixed)
  }

  const payload = Array.isArray(request.payload)
    ? await Promise.all(request.payload.map(resolveBranch))
    : await resolveBranch(request.payload || {})
  return { ...request, payload }
}

<<<<<<< HEAD
async function assertInventoryRecordOwnership(table, request, identity) {
  if (!['inventory_usage_log', 'inventory_restocks'].includes(table) || request.operation !== 'insert') return request
  const entries = Array.isArray(request.payload) ? request.payload : [request.payload]
  for (const entry of entries) {
    if (!entry?.item_id) throw Object.assign(new Error('An inventory item is required.'), { status: 400 })
    const { data: item, error } = await database.from('inventory_items').select('branch, branch_id').eq('id', entry.item_id).maybeSingle()
    if (error || !item) throw Object.assign(new Error('Inventory item not found.'), { status: 400 })
    if (identity.role !== 'admin' && item.branch_id !== identity.branchId) {
      throw Object.assign(new Error('You can only use inventory assigned to your branch.'), { status: 403 })
    }
  }
  return request
}

=======
>>>>>>> 728e40e (Fixed)
export async function execute(table, request, identity) {
  if (!TABLES.has(table)) throw Object.assign(new Error('Unknown resource'), { status: 404 })
  if (BRANCH_SCOPED_TABLES.has(table)) {
    request = identity.role === 'admin'
<<<<<<< HEAD
      ? await attachAdminBranch(table, request, identity)
      : restrictStaffBranchRequest(table, request, identity)
    request = await assertInventoryRecordOwnership(table, request, identity)
=======
      ? await attachAdminBranch(table, request)
      : restrictStaffBranchRequest(table, request, identity)
>>>>>>> 728e40e (Fixed)
  }
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

export async function getStaffProfile(authId, email) {
  const selection = 'id, role, full_name, branch, branch_id'
  const profile = await database.from('staff').select(selection).eq('auth_id', authId).maybeSingle()
  if (profile.data || profile.error || !email) return profile

  // Repair legacy staff rows created before auth_id was stored.
  const legacy = await database.from('staff').select(selection).eq('email', email).is('auth_id', null).maybeSingle()
  if (!legacy.data || legacy.error) return profile
  return database.from('staff').update({ auth_id: authId }).eq('id', legacy.data.id).is('auth_id', null).select(selection).maybeSingle()
}
