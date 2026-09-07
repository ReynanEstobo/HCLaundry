import { database } from '../config/supabase.js'

export async function trackOrder(orderNumber) {
  if (!orderNumber?.trim()) throw Object.assign(new Error('Tracking number is required'), { status: 400 })
  const { data, error } = await database.from('orders')
    .select('id, order_number, status, weight_kg, total_price, created_at, estimated_ready_at, original_estimated_ready_at, eta_revised_at, eta_source, customer_id, customers(name), service_types(name)')
    .ilike('order_number', `%${orderNumber.trim()}%`)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return { data: data || [] }
}

export async function getPublicSettings() {
  const { data, error } = await database.from('settings').select('*').single()
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return { data }
}
