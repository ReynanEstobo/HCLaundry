import { authClient } from '../config/supabase.js'
import { getStaffProfile } from '../models/databaseModel.js'

async function identityFor(user) {
  const { data: staff } = await getStaffProfile(user.id)
  return { user, role: staff?.role || 'admin', staffName: staff?.full_name || null, branch: staff?.branch || null }
}

export async function login({ email, password }) {
  if (!email || !password) throw Object.assign(new Error('Email and password are required'), { status: 400 })
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error) throw Object.assign(new Error(error.message), { status: 401 })
  return { session: data.session, ...(await identityFor(data.user)) }
}

export async function signUp({ email, password, options }) {
  if (!email || !password) throw Object.assign(new Error('Email and password are required'), { status: 400 })
  const { data, error } = await authClient.auth.signUp({ email, password, options })
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return { user: data.user, session: data.session }
}

export async function getMe(identity) {
  return identity
}

export async function updatePassword({ email, currentPassword, newPassword }) {
  if (!email || !currentPassword || !newPassword) throw Object.assign(new Error('Missing required fields'), { status: 400 })
  const client = authClient
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: currentPassword })
  if (signInError) throw Object.assign(new Error('Current password is incorrect'), { status: 400 })
  const { error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return { success: true }
}
