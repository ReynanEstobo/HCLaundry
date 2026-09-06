import { authClient } from '../config/supabase.js'
import { getStaffProfile } from '../models/databaseModel.js'

export async function authenticate(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })
  const { data: staff } = await getStaffProfile(data.user.id, data.user.email)
  return {
    user: data.user,
    role: String(staff?.role || 'unassigned').toLowerCase(),
    staffId: staff?.id || null,
    staffName: staff?.full_name || null,
    branch: staff?.branch || null,
    branchId: staff?.branch_id || null,
  }
}

export function requireAdmin(identity) {
  if (identity.role !== 'admin') throw Object.assign(new Error('Administrator access required'), { status: 403 })
}
