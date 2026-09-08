import { Loader2 } from 'lucide-react'

/**
 * Shared mutation button. Keep `loading` true until the request and any
 * required local refresh have both completed, so a second click cannot create
 * duplicate records or overwrite an in-flight change.
 */
export default function LoadingButton({
  loading = false,
  loadingLabel = 'Saving…',
  disabled = false,
  children,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <><Loader2 size={16} className="button-spinner" /> {loadingLabel}</> : children}
    </button>
  )
}
