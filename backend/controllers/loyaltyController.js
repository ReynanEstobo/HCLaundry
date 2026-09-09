import { database } from '../config/supabase.js'

function requireAdmin(identity) {
  if (identity.role !== 'admin') throw Object.assign(new Error('Administrator access required'), { status: 403 })
}

export async function listLoyaltyRewards(identity) {
  requireAdmin(identity)
  const { data, error } = await database
    .from('loyalty_rewards')
    .select('id, reward_type, status, discount_percent, free_load_kg, earned_at, expires_at, redeemed_at, revoke_reason, customers(name, phone), orders!loyalty_rewards_earned_order_id_fkey(order_number)')
    .order('earned_at', { ascending: false })
    .limit(100)
  if (error) throw Object.assign(new Error(error.message), { status: 400, details: error })
  return { data: data || [] }
}

export async function revokeLoyaltyReward(body, identity) {
  requireAdmin(identity)
  const rewardId = String(body?.rewardId || '').trim()
  const reason = String(body?.reason || '').trim()
  if (!rewardId || !reason) throw Object.assign(new Error('A reward and revocation reason are required.'), { status: 400 })
  const { data: reward, error: findError } = await database
    .from('loyalty_rewards').select('id, customer_id, status').eq('id', rewardId).maybeSingle()
  if (findError || !reward) throw Object.assign(new Error('Loyalty reward not found.'), { status: 404 })
  if (reward.status !== 'available') throw Object.assign(new Error('Only available rewards can be revoked.'), { status: 400 })
  const { data, error } = await database.from('loyalty_rewards')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by_staff_id: identity.staffId, revoke_reason: reason })
    .eq('id', reward.id).eq('status', 'available').select('*').maybeSingle()
  if (error || !data) throw Object.assign(new Error('This reward is no longer available.'), { status: 400 })
  await database.from('audit_logs').insert({
    action: 'update', table_name: 'loyalty_rewards', record_id: reward.id,
    actor_staff_id: identity.staffId, before_data: { status: 'available' },
    after_data: { status: 'revoked', reason },
  })
  return { data }
}
