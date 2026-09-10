// OTPs, passwords, and current-password values must never be stored here.
// sessionStorage survives a refresh in the same tab and is cleared when the tab closes.
export function readOtpSession(key, maxAgeMs = 10 * 60 * 1000) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) || 'null')
    if (!value || !value.requestedAt || Date.now() - value.requestedAt > maxAgeMs) {
      window.sessionStorage.removeItem(key)
      return null
    }
    return value
  } catch {
    return null
  }
}

export function writeOtpSession(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...value, requestedAt: Date.now() }))
  } catch {
    // The OTP process remains usable when browser storage is unavailable.
  }
}

export function clearOtpSession(key) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Nothing else is needed when browser storage is unavailable.
  }
}
