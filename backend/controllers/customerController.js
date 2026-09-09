import { database } from '../config/supabase.js'

async function resolveBranch(identity, requestedBranch) {
  if (!identity.staffId) throw Object.assign(new Error('Your account must have a staff profile before managing clients.'), { status: 403 })
  if (identity.role === 'staff') {
    if (!identity.branchId) throw Object.assign(new Error('Your staff account must be assigned to a branch.'), { status: 403 })
    return { id: identity.branchId, name: identity.branch }
  }
  if (identity.role !== 'admin' || !requestedBranch) throw Object.assign(new Error('Administrators must select a branch.'), { status: 400 })
  const { data, error } = await database.from('branches').select('id, name').eq('name', requestedBranch).maybeSingle()
  if (error || !data) throw Object.assign(new Error('The selected branch does not exist.'), { status: 400 })
  return data
}

export async function listVisibleCustomers(identity) {
  if (identity.role === 'admin') {
    const { data, error } = await database.from('customers').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
    return { data: data || [] }
  }
  if (identity.role !== 'staff' || !identity.branchId) {
    throw Object.assign(new Error('Your staff account must be assigned to a branch before viewing clients.'), { status: 403 })
  }
  const { data, error } = await database
    .from('customer_branches')
    .select('customers!inner(*)')
    .is('customers.deleted_at', null)
    .eq('branch_id', identity.branchId)
    .order('last_served_at', { ascending: false })
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  return { data: (data || []).map(row => row.customers).filter(customer => customer && !customer.deleted_at) }
}

export async function lookupCustomer(phone, identity) {
  if (!phone) throw Object.assign(new Error('A phone number is required.'), { status: 400 })
  const { data, error } = await database.rpc('find_customer_by_phone', { p_phone: phone })
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  const customer = data?.[0]
  if (!customer) return { exists: false, visible: false, customer: null, loyalty: { availableRewards: [] } }
  // Reward availability is global to the central customer identity, while the
  // directory itself remains branch-scoped. Exact-phone order lookup is the
  // only staff path that exposes these claims, so a staff member can redeem a
  // customer's own reward at any branch without browsing other clients.
  await database.rpc('expire_customer_loyalty_rewards', { p_customer_id: customer.id })
  const { data: rewards, error: rewardsError } = await database
    .from('loyalty_rewards')
    .select('id, reward_type, discount_percent, free_load_kg, expires_at, earned_at')
    .eq('customer_id', customer.id)
    .eq('status', 'available')
    .order('earned_at', { ascending: true })
  if (rewardsError) throw Object.assign(new Error(rewardsError.message), { status: 400, details: rewardsError })
  const loyalty = { availableRewards: rewards || [] }
  if (identity.role === 'admin') return { exists: true, visible: true, customer, loyalty }
  const { data: association } = await database.from('customer_branches').select('customer_id').eq('customer_id', customer.id).eq('branch_id', identity.branchId).maybeSingle()
  // The client directory remains branch-scoped, but an exact phone match in
  // the order form may safely hydrate the name/email to prevent duplicates.
  return { exists: true, visible: Boolean(association), customer, loyalty }
}

export async function registerCustomer(body, identity) {
  const branch = await resolveBranch(identity, body?.branch)
  const { data, error } = await database.rpc('register_branch_customer', {
    p_branch_id: branch.id,
    p_staff_id: identity.staffId,
    p_name: body?.name || '',
    p_phone: body?.phone || '',
    p_email: body?.email || '',
    p_notes: body?.notes || '',
  })
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  return { data }
}
