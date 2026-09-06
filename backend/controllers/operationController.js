import { database } from '../config/supabase.js'

function requireBranch(identity) {
  if (!identity.staffId) throw Object.assign(new Error('Your account must have a staff profile before it can process operations.'), { status: 403 })
  if (identity.role !== 'admin' && (!identity.branchId || !identity.branch)) throw Object.assign(new Error('Your staff account must be assigned to a branch.'), { status: 403 })
}

async function resolveBranch(identity, requestedBranch) {
  requireBranch(identity)
  if (identity.role !== 'admin') return { id: identity.branchId, name: identity.branch }
  if (!requestedBranch) throw Object.assign(new Error('Administrators must select a branch.'), { status: 400 })
  const { data, error } = await database.from('branches').select('id, name').eq('name', requestedBranch).maybeSingle()
  if (error || !data) throw Object.assign(new Error('The selected branch does not exist.'), { status: 400 })
  return data
}

export async function createOrder(body, identity) {
  const { customer = {}, order = {}, addons = {}, branch } = body || {}
  const selectedBranch = await resolveBranch(identity, branch)
  const weight = Number(order.weight_kg)
  const total = Number(order.total_price)
  const amountPaid = Number(order.amount_paid || 0)
  if (!Number.isFinite(weight) || weight <= 0) throw Object.assign(new Error('A valid order weight is required.'), { status: 400 })
  if (!Number.isFinite(total) || total < 0) throw Object.assign(new Error('A valid order total is required.'), { status: 400 })
  if (amountPaid < total * 0.5) throw Object.assign(new Error(`Minimum 50% payment required: ₱${(total * 0.5).toLocaleString()}`), { status: 400 })
  const loads = Math.max(1, Math.ceil(weight / Number(body.bundleKg || 8)))
  const payload = {
    service_type_id: order.service_type_id || null,
    weight_kg: weight,
    total_price: total,
    notes: order.notes || '',
    payment_method: order.payment_method || 'cash',
    payment_status: amountPaid >= total ? 'paid' : 'partial',
    amount_paid: amountPaid,
  }
  const { data, error } = await database.rpc('create_branch_order', {
    p_branch_id: selectedBranch.id,
    p_staff_id: identity.staffId,
    p_customer: customer,
    p_order: payload,
    p_addons: addons,
    p_loads: loads,
  })
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  return { data }
}

export async function restockInventory(body, identity) {
  const { itemId, quantity, costTotal, supplier } = body || {}
  const added = Number(quantity)
  if (!itemId || !Number.isFinite(added) || added <= 0) throw Object.assign(new Error('A valid inventory item and restock quantity are required.'), { status: 400 })
  requireBranch(identity)
  const { data: item, error: itemError } = await database.from('inventory_items').select('id, name, current_stock, unit, branch, branch_id').eq('id', itemId).maybeSingle()
  if (itemError || !item) throw Object.assign(new Error('Inventory item not found.'), { status: 404 })
  if (identity.role !== 'admin' && item.branch_id !== identity.branchId) throw Object.assign(new Error('You can only restock inventory assigned to your branch.'), { status: 403 })
  const { data, error } = await database.rpc('restock_branch_inventory', {
    p_item_id: item.id,
    p_quantity: added,
    p_cost_total: Number(costTotal) || 0,
    p_supplier: supplier || '',
  })
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  return { data }
}
