import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiFetch } from '../services/api/client'
import { supabase } from '../lib/supabase'
import LoadingButton from '../components/LoadingButton'

function PasswordField({ label, value, onChange, visible, onToggle, placeholder }) {
  return <div className="login-field">
    <label>{label}</label>
    <div className="login-input-wrap">
      <LockKeyhole size={15} className="login-input-icon" />
      <input className="login-input login-input-password" type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" required />
      <button type="button" className="login-eye-btn" onClick={onToggle} aria-label={visible ? `Hide ${label}` : `Show ${label}`}>
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  </div>
}

export default function AccountSecurity() {
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [otp, setOtp] = useState('')
  const [destination, setDestination] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [visible, setVisible] = useState({ next: false, confirmation: false })

  async function requestCode() {
    setSendingCode(true)
    try {
      const result = await apiFetch('/api/auth/password/otp', { method: 'POST' })
      setDestination(result.destination)
      toast.success(`Verification code sent to ${result.destination}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSendingCode(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (newPassword.length < 10) return toast.error('Use at least 10 characters for your new password.')
    if (newPassword !== confirmation) return toast.error('Passwords do not match.')
    if (!destination) return toast.error('Send and verify an email code first.')
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter the 6-digit verification code.')
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, otp })
      if (error) throw new Error(error.message)
      setPasswordChanged(true)
    } catch (error) {
      toast.error(error.message || 'Unable to change password.')
    } finally {
      setSaving(false)
    }
  }

  const flip = field => () => setVisible(state => ({ ...state, [field]: !state[field] }))
  return <div className="account-security-page">
    <section className="card settings-card account-security-card">
      <div className="settings-card-header account-security-header">
        <div className="settings-card-icon blue"><ShieldCheck size={24} /></div>
        <div><span className="account-security-kicker">ACCOUNT SECURITY</span><h3>Change Password</h3><p>Verify your identity with a one-time code sent to your contact email.</p></div>
      </div>
      <div className="account-security-steps" aria-label="Password change steps"><span className="active"><b>1</b> Request code</span><span className={destination ? 'active' : ''}><b>2</b> Verify email</span><span><b>3</b> New password</span></div>
      <form onSubmit={submit} className="login-form account-security-form">
        <LoadingButton type="button" className="account-security-code-button" onClick={requestCode} loading={sendingCode} loadingLabel="Sending verification code…">
          <MailCheck size={16} /> {destination ? 'Resend verification code' : 'Send verification code'}
        </LoadingButton>
        {destination && <div className="account-security-notice"><MailCheck size={16} /><span>Code sent to <strong>{destination}</strong>. It expires in 10 minutes.</span></div>}
        <div className="login-field" style={{ marginTop: 16 }}>
          <label>Email verification code</label>
          <div className="login-input-wrap">
            <KeyRound size={15} className="login-input-icon" />
            <input className="login-input account-security-otp" inputMode="numeric" maxLength={6} value={otp} disabled={!destination} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" required />
          </div>
        </div>
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} visible={visible.next} onToggle={flip('next')} placeholder="At least 10 characters" />
        <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} visible={visible.confirmation} onToggle={flip('confirmation')} placeholder="Re-enter your new password" />
        <LoadingButton type="submit" className="btn btn-primary" loading={saving} loadingLabel="Changing password…"><LockKeyhole size={16} /> Change password</LoadingButton>
      </form>
    </section>
    {passwordChanged && <div className="modal-overlay account-security-success-overlay" role="presentation">
      <section className="account-security-success-dialog" role="alertdialog" aria-modal="true" aria-labelledby="password-success-title">
        <span className="account-security-success-icon"><CheckCircle2 size={32} /></span>
        <h3 id="password-success-title">Password changed successfully</h3>
        <p>Your password was updated and your account is now using a fresh secure session.</p>
        <div className="account-security-success-note">For your protection, do not share your new password or verification code with anyone.</div>
        <button className="account-security-submit" onClick={() => navigate('/dashboard', { replace: true })}>Continue to dashboard</button>
      </section>
    </div>}
  </div>
}
