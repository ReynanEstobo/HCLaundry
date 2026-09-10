import { Eye, EyeOff, KeyRound, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { apiFetch } from '../services/api/client'

function PasswordInput({ label, value, onChange, visible, onToggle, disabled }) {
  return <div className="login-field">
    <label>{label}</label>
    <div className="login-input-wrap">
      <LockKeyhole size={15} className="login-input-icon" />
      <input className="login-input login-input-password" type={visible ? 'text' : 'password'} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} placeholder="At least 10 characters" autoComplete="new-password" required />
      <button type="button" className="login-eye-btn" disabled={disabled} onClick={onToggle}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
  </div>
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [recoveryEmailMissing, setRecoveryEmailMissing] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpStatus, setOtpStatus] = useState('idle')
  const [otpMessage, setOtpMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const verified = otpStatus === 'valid'

  async function requestCode() {
    if (!identifier.trim()) return toast.error('Enter your Staff ID, username, or email.')
    setLoading(true)
    setRecoveryEmailMissing(false)
    try {
      await apiFetch('/api/auth/forgot-password/otp', { method: 'POST', body: JSON.stringify({ identifier }) })
      setCodeRequested(true)
      setOtp(''); setOtpStatus('idle'); setOtpMessage(''); setPassword(''); setConfirmation('')
      toast.success('A verification code has been sent to your recovery email.')
    } catch (error) { setRecoveryEmailMissing(error.data?.code === 'CONTACT_EMAIL_REQUIRED'); toast.error(error.message) } finally { setLoading(false) }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp)) { setOtpStatus('invalid'); setOtpMessage('Enter the complete 6-digit code.'); return }
    setOtpStatus('checking'); setOtpMessage('')
    try {
      await apiFetch('/api/auth/forgot-password/otp/verify', { method: 'POST', body: JSON.stringify({ identifier, otp }) })
      setOtpStatus('valid')
    } catch (error) {
      setOtpStatus('invalid')
      setOtpMessage(/invalid verification code/i.test(error.message) ? 'OTP is wrong. Please try again.' : error.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!verified) return toast.error('Verify your OTP before setting a new password.')
    if (password.length < 10) return toast.error('Use at least 10 characters for your new password.')
    if (password !== confirmation) return toast.error('Passwords do not match.')
    setLoading(true)
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'PATCH', body: JSON.stringify({ identifier, otp, newPassword: password }) })
      toast.success('Password reset successfully. You can now sign in.')
      navigate('/login', { replace: true })
    } catch (error) { toast.error(error.message) } finally { setLoading(false) }
  }

  const updateOtp = value => { setOtp(value.replace(/\D/g, '')); setOtpStatus('idle'); setOtpMessage('') }
  const locked = loading || !verified
  return <main className="login-page-wrapper"><section className="login-right-panel" style={{ width: '100%', minHeight: '100vh' }}><div className="login-form-wrapper"><div className="login-card-enhanced"><div className="login-card-header"><div className="login-card-icon"><ShieldCheck size={24} /></div><div><h2>Reset your password</h2><p>Verify your contact email before setting a new password.</p></div></div><form onSubmit={submit} className="login-form"><div className="login-field"><label>Account ID, username, or email</label><div className="login-input-wrap"><KeyRound size={15} className="login-input-icon" /><input className="login-input" value={identifier} disabled={codeRequested || loading} onChange={event => setIdentifier(event.target.value)} placeholder="e.g. IC-STAFF-AB12CD34" required /></div></div><LoadingButton type="button" className="login-submit-btn" onClick={requestCode} loading={loading} loadingLabel="Sending...">{codeRequested ? 'Resend verification code' : <><MailCheck size={16} /> Send verification code</>}</LoadingButton>{recoveryEmailMissing && <div className="otp-email-missing" role="alert">No recovery email is bound to this account. Please contact an administrator to add one, then request a new OTP.</div>}{codeRequested && <><div className="login-field"><label>Email verification code</label><div className="login-input-wrap"><KeyRound size={15} className="login-input-icon" /><input className={`login-input otp-verification-input ${otpStatus}`} inputMode="numeric" maxLength={6} disabled={loading || verified} value={otp} onChange={event => updateOtp(event.target.value)} placeholder="6-digit code" aria-invalid={otpStatus === 'invalid'} required /></div>{otpMessage && <p className="otp-verification-message" role="alert">{otpMessage}</p>}</div><LoadingButton type="button" className="login-submit-btn" disabled={loading || verified} onClick={verifyOtp} loading={otpStatus === 'checking'} loadingLabel="Checking OTP...">{verified ? 'OTP verified' : 'Verify OTP'}</LoadingButton>{verified && <div className="otp-verification-success" role="status">OTP verified. You can now set a new password.</div>}<PasswordInput label="New password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword(value => !value)} disabled={locked} /><PasswordInput label="Confirm new password" value={confirmation} onChange={setConfirmation} visible={showConfirmation} onToggle={() => setShowConfirmation(value => !value)} disabled={locked} /><LoadingButton type="submit" className="login-submit-btn" disabled={!verified} loading={loading} loadingLabel="Resetting...">Reset password</LoadingButton></>}<div className="login-card-footer"><Link to="/login">Back to sign in</Link></div></form></div></div></section></main>
}
