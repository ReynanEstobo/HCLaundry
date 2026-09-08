import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingButton from '../components/LoadingButton'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const { error: signInError } = await signIn(identifier, password)
      if (signInError) setError(signInError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page-wrapper">
      <div className="login-left-panel">
        <div className="login-left-circle login-left-circle-1" />
        <div className="login-left-circle login-left-circle-2" />
        <div className="login-left-circle login-left-circle-3" />
        <img src="/assets/Rectangle.png" alt="H&C Laundry" className="login-left-logo" />
        <div className="login-left-text">
          <h1>H&C Laundry</h1>
          <p>Professional laundry services - fresh, clean, and perfectly cared every time.</p>
        </div>
      </div>

      <div className="login-right-panel">
        <div className="login-grid-bg" />
        <div className="login-form-wrapper">
          <button onClick={() => navigate('/')} className="login-back-btn" disabled={loading}>
            <ArrowLeft size={15} /> Back to Home
          </button>
          <div className="login-card-enhanced">
            <div className="login-card-header">
              <div className="login-card-icon"><img src="/assets/Rectangle.png" alt="H&C Laundry" /></div>
              <div><h2>Welcome back</h2><p>Sign in to H&C Laundry dashboard</p></div>
            </div>
            {error && <div className="login-error-enhanced"><AlertCircle size={15} />{error}</div>}
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label>Account ID or Username</label>
                <div className="login-input-wrap">
                  <UserRound size={15} className="login-input-icon" />
                  <input className="login-input" type="text" placeholder="e.g. maria.santos" value={identifier} disabled={loading} onChange={event => setIdentifier(event.target.value)} required />
                </div>
              </div>
              <div className="login-field">
                <label>Password</label>
                <div className="login-input-wrap">
                  <Lock size={15} className="login-input-icon" />
                  <input className="login-input login-input-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} disabled={loading} onChange={event => setPassword(event.target.value)} required />
                  <button type="button" className="login-eye-btn" disabled={loading} onClick={() => setShowPassword(visible => !visible)}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <LoadingButton type="submit" className="login-submit-btn" loading={loading} loadingLabel="Signing in...">Sign In</LoadingButton>
              <div className="login-card-footer" style={{ marginTop: 16 }}>
                <button type="button" className="login-forgot-password" disabled={loading} onClick={() => navigate('/forgot-password')}>Forgot password?</button>
              </div>
            </form>
            <div className="login-card-footer">Powered by H&C Laundry &copy; {new Date().getFullYear()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
