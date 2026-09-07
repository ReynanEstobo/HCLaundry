import { authClient, database } from '../config/supabase.js'
import { getStaffProfile } from '../models/databaseModel.js'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { sendEmail } from '../services/notificationService.js'

async function identityFor(user) {
  const { data: staff } = await getStaffProfile(user.id, user.email)
  return {
    user,
    staffId: staff?.id || null,
    role: String(staff?.role || 'unassigned').toLowerCase(),
    staffName: staff?.full_name || null,
    branch: staff?.branch || null,
    mustChangePassword: Boolean(staff?.must_change_password),
  }
}

export async function login({ identifier, email, password }) {
  const submittedIdentifier = String(identifier || email || '').trim()
  if (!submittedIdentifier || !password) throw Object.assign(new Error('Staff ID or username and password are required'), { status: 400 })
  let authEmail = submittedIdentifier
  if (!submittedIdentifier.includes('@')) {
    let staffQuery = database
      .from('staff')
      .select('email')
      .is('deleted_at', null)
    staffQuery = submittedIdentifier.toUpperCase().startsWith('HC-STAFF-')
      ? staffQuery.eq('staff_code', submittedIdentifier.toUpperCase())
      : staffQuery.ilike('username', submittedIdentifier)
    const { data: staff, error: staffError } = await staffQuery.maybeSingle()
    if (staffError) throw Object.assign(new Error(staffError.message), { status: 400 })
    if (!staff?.email) throw Object.assign(new Error('Invalid staff ID or username.'), { status: 401 })
    authEmail = staff.email
  }
  const { data, error } = await authClient.auth.signInWithPassword({ email: authEmail, password })
  if (error) throw Object.assign(new Error(error.message), { status: 401 })
  const identity = await identityFor(data.user)
  if (data.user.user_metadata?.staff_code && identity.role === 'unassigned') {
    await authClient.auth.signOut()
    throw Object.assign(new Error('This staff account is inactive. Contact an administrator.'), { status: 403 })
  }
  return { session: data.session, ...identity }
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

function hashOtp(challengeId, code) {
  const secret = process.env.PASSWORD_OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  return createHash('sha256').update(`${secret}:${challengeId}:${code}`).digest('hex')
}

async function passwordVerificationEmail(identity) {
  const { data: staff, error } = identity.staffId
    ? await database.from('staff').select('contact_email, email').eq('id', identity.staffId).maybeSingle()
    : { data: null, error: null }
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  const email = staff?.contact_email || (staff?.email?.endsWith('@accounts.hclaundry.local') ? null : staff?.email) || identity.user.email
  if (!email || email.endsWith('@accounts.hclaundry.local')) {
    throw Object.assign(new Error('No contact email is available. Ask an administrator to add one before changing your password.'), { status: 400 })
  }
  return email
}

async function issuePasswordOtp({ userId, staffId, email }) {
  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error: closeError } = await database
    .from('password_change_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('auth_user_id', userId)
    .is('consumed_at', null)
  if (closeError) throw Object.assign(new Error(closeError.message), { status: 400 })
  const { data: challenge, error } = await database
    .from('password_change_otps')
    .insert({ auth_user_id: userId, staff_id: staffId, email, code_hash: 'pending', expires_at: expiresAt })
    .select('id')
    .single()
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  const { error: hashError } = await database.from('password_change_otps').update({ code_hash: hashOtp(challenge.id, code) }).eq('id', challenge.id)
  if (hashError) throw Object.assign(new Error(hashError.message), { status: 400 })
  try {
    await sendEmail({
      to: email,
      subject: 'H&C Laundry password verification code',
      body: `Your H&C Laundry password-change code is: ${code}\n\nIt expires in 10 minutes. Do not share this code with anyone. If you did not request a password change, you can ignore this email.`,
    })
  } catch (sendError) {
    await database.from('password_change_otps').update({ consumed_at: new Date().toISOString() }).eq('id', challenge.id)
    throw sendError
  }
  return { success: true, expiresInSeconds: 600, destination: email.replace(/^(.{2}).+(@.+)$/, '$1***$2') }
}

export async function requestPasswordOtp(_body, identity) {
  if (identity.mustChangePassword) throw Object.assign(new Error('Activate your account first using the temporary password.'), { status: 400 })
  const email = await passwordVerificationEmail(identity)
  return issuePasswordOtp({ userId: identity.user.id, staffId: identity.staffId, email })
}

async function verifyPasswordOtp(identity, code) {
  if (!/^\d{6}$/.test(String(code || ''))) throw Object.assign(new Error('Enter the 6-digit verification code.'), { status: 400 })
  const { data: challenge, error } = await database
    .from('password_change_otps')
    .select('*')
    .eq('auth_user_id', identity.user.id)
    .is('consumed_at', null)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  if (!challenge || new Date(challenge.expires_at) <= new Date() || challenge.attempts >= 5) {
    throw Object.assign(new Error('Your verification code has expired. Request a new code.'), { status: 400 })
  }
  const expected = Buffer.from(challenge.code_hash, 'hex')
  const actual = Buffer.from(hashOtp(challenge.id, String(code)), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await database.from('password_change_otps').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id)
    throw Object.assign(new Error('Invalid verification code.'), { status: 400 })
  }
  return challenge
}

async function findResetAccount(identifier) {
  const value = String(identifier || '').trim()
  if (!value) return null
  let query = database.from('staff').select('id, auth_id, email, contact_email, deleted_at').is('deleted_at', null)
  query = value.includes('@') ? query.or(`email.eq.${value},contact_email.eq.${value}`) : value.toUpperCase().startsWith('HC-STAFF-') ? query.eq('staff_code', value.toUpperCase()) : query.ilike('username', value)
  const { data, error } = await query.maybeSingle()
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  if (!data?.auth_id) return null
  const email = data.contact_email || (data.email?.endsWith('@accounts.hclaundry.local') ? null : data.email)
  return email ? { user: { id: data.auth_id }, staffId: data.id, email } : null
}

export async function requestForgotPasswordOtp({ identifier }) {
  const account = await findResetAccount(identifier)
  // Always return the same response to avoid leaking whether an account exists.
  if (account) await issuePasswordOtp({ userId: account.user.id, staffId: account.staffId, email: account.email })
  return { success: true, message: 'If the account and a contact email exist, a verification code has been sent.' }
}

export async function resetForgottenPassword({ identifier, otp, newPassword }) {
  if (!newPassword || newPassword.length < 10) throw Object.assign(new Error('Your new password must contain at least 10 characters.'), { status: 400 })
  const account = await findResetAccount(identifier)
  if (!account) throw Object.assign(new Error('Unable to verify this account. Check the identifier or contact an administrator.'), { status: 400 })
  const challenge = await verifyPasswordOtp(account, otp)
  const { error } = await database.auth.admin.updateUserById(account.user.id, { password: newPassword })
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  await database.from('password_change_otps').update({ consumed_at: new Date().toISOString() }).eq('id', challenge.id)
  await database.from('staff').update({ must_change_password: false }).eq('id', account.staffId)
  return { success: true }
}

export async function updatePassword({ currentPassword, newPassword, otp }, identity) {
  const email = identity?.user?.email
  if (!email || !newPassword) throw Object.assign(new Error('Missing required fields'), { status: 400 })
  if (newPassword.length < 10) throw Object.assign(new Error('Your new password must contain at least 10 characters.'), { status: 400 })
  let error
  let challenge
  if (identity.mustChangePassword) {
    // This is a one-time activation endpoint. The authenticated bearer token
    // proves account ownership, so a page refresh cannot lose the temporary
    // password and prevent activation.
    ;({ error } = await database.auth.admin.updateUserById(identity.user.id, { password: newPassword }))
  } else {
    // Administrators use the password form in Settings. Their current
    // password re-authenticates the session before the update; staff use the
    // self-service email-OTP screen.
    if (identity.role === 'admin' && currentPassword) {
      const { error: signInError } = await authClient.auth.signInWithPassword({ email, password: currentPassword })
      if (signInError) throw Object.assign(new Error('Current password is incorrect.'), { status: 400 })
    } else {
      challenge = await verifyPasswordOtp(identity, otp)
    }
    ;({ error } = await database.auth.admin.updateUserById(identity.user.id, { password: newPassword }))
  }
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  if (challenge) await database.from('password_change_otps').update({ consumed_at: new Date().toISOString() }).eq('id', challenge.id)
  if (identity?.staffId) {
    const { error: staffError } = await database.from('staff').update({ must_change_password: false }).eq('id', identity.staffId)
    if (staffError) throw Object.assign(new Error(staffError.message), { status: 400 })
  }
  return { success: true }
}
