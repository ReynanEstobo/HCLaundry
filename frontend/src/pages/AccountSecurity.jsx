import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiFetch } from '../services/api/client'
import LoadingButton from '../components/LoadingButton'
import ChangeEmail from '../components/ChangeEmail'

function PasswordField({ label, value, onChange, visible, onToggle, placeholder, disabled }) {
  return <div className="login-field">
    <label>{label}</label>
    <div className="login-input-wrap">
      <LockKeyhole size={15} className="login-input-icon" />
      <input className="login-input login-input-password" type={visible ? 'text' : 'password'} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" required />
      <button type="button" className="login-eye-btn" disabled={disabled} onClick={onToggle} aria-label={visible ? `Hide ${label}` : `Show ${label}`}>
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
  const [otpStatus, setOtpStatus] = useState('idle')
  const [otpMessage, setOtpMessage] = useState('')
  const [destination, setDestination] = useState('')
  const [recoveryEmailMissing, setRecoveryEmailMissing] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [visible, setVisible] = useState({ next: false, confirmation: false })

  async function requestCode() {
    setSendingCode(true)
    setRecoveryEmailMissing(false)
    try {
      const result = await apiFetch('/api/auth/password/otp', { method: 'POST' })
      setDestination(result.destination)
      setOtp(''); setOtpStatus('idle'); setOtpMessage(''); setNewPassword(''); setConfirmation('')
      toast.success(`Verification code sent to ${result.destination}`)
    } catch (error) {
      setRecoveryEmailMissing(error.data?.code === 'CONTACT_EMAIL_REQUIRED')
      toast.error(error.message)
    } finally {
      setSendingCode(false)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otp)) { setOtpStatus('invalid'); setOtpMessage('Enter the complete 6-digit code.'); return }
    setOtpStatus('checking'); setOtpMessage('')
    try {
      await apiFetch('/api/auth/password/otp/verify', { method: 'POST', body: JSON.stringify({ otp }) })
      setOtpStatus('valid')
    } catch (error) {
      setOtpStatus('invalid')
      setOtpMessage(/invalid verification code/i.test(error.message) ? 'OTP is wrong. Please try again.' : error.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (newPassword.length < 10) return toast.error('Use at least 10 characters for your new password.')
    if (newPassword !== confirmation) return toast.error('Passwords do not match.')
    if (otpStatus !== 'valid') return toast.error('Verify your OTP before setting a new password.')
    setSaving(true)
    try {
      await apiFetch('/api/auth/password', { method: 'PATCH', body: JSON.stringify({ newPassword, otp }) })
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
      <div className="account-security-steps" aria-label="Password change steps"><span className="active"><b>1</b> Request code</span><span className={otpStatus === 'valid' ? 'active' : ''}><b>2</b> Verify email</span><span className={otpStatus === 'valid' ? 'active' : ''}><b>3</b> New password</span></div>
      <form onSubmit={submit} className="login-form account-security-form">
        <LoadingButton type="button" className="account-security-code-button" onClick={requestCode} loading={sendingCode} loadingLabel="Sending verification code…">
          <MailCheck size={16} /> {destination ? 'Resend verification code' : 'Send verification code'}
        </LoadingButton>
        {recoveryEmailMissing && <div className="otp-email-missing" role="alert">No recovery email is bound to your account. Use <strong>Change Bound Email</strong> below to add one before requesting an OTP.</div>}
        {destination && <div className="account-security-notice"><MailCheck size={16} /><span>Code sent to <strong>{destination}</strong>. It expires in 10 minutes.</span></div>}
        <div className="login-field" style={{ marginTop: 16 }}>
          <label>Email verification code</label>
          <div className="login-input-wrap">
            <KeyRound size={15} className="login-input-icon" />
            <input className={`login-input account-security-otp otp-verification-input ${otpStatus}`} inputMode="numeric" maxLength={6} value={otp} disabled={!destination || saving || otpStatus === 'valid'} onChange={event => { setOtp(event.target.value.replace(/\D/g, '')); setOtpStatus('idle'); setOtpMessage('') }} placeholder="000000" aria-invalid={otpStatus === 'invalid'} required />
          </div>
          {otpMessage && <p className="otp-verification-message" role="alert">{otpMessage}</p>}
        </div>
        {destination && <LoadingButton type="button" className="account-security-code-button" disabled={saving || otpStatus === 'valid'} onClick={verifyCode} loading={otpStatus === 'checking'} loadingLabel="Checking OTP…">{otpStatus === 'valid' ? 'OTP verified' : 'Verify OTP'}</LoadingButton>}
        {otpStatus === 'valid' && <div className="otp-verification-success" role="status">OTP verified. You can now set a new password.</div>}
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} visible={visible.next} onToggle={flip('next')} placeholder="At least 10 characters" disabled={saving || otpStatus !== 'valid'} />
        <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} visible={visible.confirmation} onToggle={flip('confirmation')} placeholder="Re-enter your new password" disabled={saving || otpStatus !== 'valid'} />
        <LoadingButton type="submit" className="btn btn-primary" disabled={otpStatus !== 'valid'} loading={saving} loadingLabel="Changing password…"><LockKeyhole size={16} /> Change password</LoadingButton>
      </form>
    </section>
    <ChangeEmail onChanged={() => { setOtp(''); setDestination(''); setOtpStatus('idle') }} />
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
