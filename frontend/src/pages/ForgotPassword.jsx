import { Eye, EyeOff, KeyRound, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiFetch } from '../services/api/client'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)

  async function requestCode() {
    if (!identifier.trim()) return toast.error('Enter your Staff ID, username, or email.')
    setLoading(true)
    try {
      await apiFetch('/api/auth/forgot-password/otp', { method: 'POST', body: JSON.stringify({ identifier }) })
      setCodeRequested(true)
      toast.success('If the account has a contact email, a code was sent.')
    } catch (error) { toast.error(error.message) } finally { setLoading(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (!codeRequested) return toast.error('Request a verification code first.')
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter the 6-digit verification code.')
    if (password.length < 10) return toast.error('Use at least 10 characters for your new password.')
    if (password !== confirmation) return toast.error('Passwords do not match.')
    setLoading(true)
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'PATCH', body: JSON.stringify({ identifier, otp, newPassword: password }) })
      toast.success('Password reset successfully. You can now sign in.')
      navigate('/login', { replace: true })
    } catch (error) { toast.error(error.message) } finally { setLoading(false) }
  }
  return <main className="login-page-wrapper"><section className="login-right-panel" style={{ width: '100%', minHeight: '100vh' }}><div className="login-form-wrapper"><div className="login-card-enhanced"><div className="login-card-header"><div className="login-card-icon"><ShieldCheck size={24} /></div><div><h2>Reset your password</h2><p>Verify your contact email before setting a new password.</p></div></div><form onSubmit={submit} className="login-form"><div className="login-field"><label>Staff ID, username, or email</label><div className="login-input-wrap"><KeyRound size={15} className="login-input-icon" /><input className="login-input" value={identifier} disabled={codeRequested} onChange={event => setIdentifier(event.target.value)} placeholder="e.g. HC-STAFF-AB12CD34" required /></div></div><button type="button" className="login-submit-btn" onClick={requestCode} disabled={loading}>{loading ? 'Sending...' : codeRequested ? 'Resend verification code' : <><MailCheck size={16} /> Send verification code</>}</button>{codeRequested && <><div className="login-field"><label>Email verification code</label><div className="login-input-wrap"><KeyRound size={15} className="login-input-icon" /><input className="login-input" inputMode="numeric" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" required /></div></div>{[['New password', password, setPassword, showPassword, setShowPassword], ['Confirm new password', confirmation, setConfirmation, showConfirmation, setShowConfirmation]].map(([label, value, setter, visible, setVisible]) => <div className="login-field" key={label}><label>{label}</label><div className="login-input-wrap"><LockKeyhole size={15} className="login-input-icon" /><input className="login-input login-input-password" type={visible ? 'text' : 'password'} value={value} onChange={event => setter(event.target.value)} placeholder="At least 10 characters" required /><button type="button" className="login-eye-btn" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>)}<button type="submit" className="login-submit-btn" disabled={loading}>{loading ? 'Resetting...' : 'Reset password'}</button></>}<div className="login-card-footer"><Link to="/login">Back to sign in</Link></div></form></div></div></section></main>
}
