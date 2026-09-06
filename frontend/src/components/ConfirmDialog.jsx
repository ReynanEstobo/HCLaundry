import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react";

/** A keyboard-accessible in-app confirmation dialog; never uses window.confirm. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Keep",
  variant = "danger",
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!open) return null;
  const isRestore = variant === "restore";

  return (
    <div
      className="modal-overlay confirm-dialog-overlay"
      role="presentation"
      onMouseDown={() => !loading && onClose()}
    >
      <section
        className={`confirm-dialog confirm-dialog-${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="confirm-dialog-header">
          <span className="confirm-dialog-icon">
            {isRestore ? <RotateCcw size={22} /> : <AlertTriangle size={22} />}
          </span>
          <div>
            <h3 id="confirm-dialog-title">{title}</h3>
          </div>
          <button className="btn-icon" aria-label="Close dialog" disabled={loading} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="confirm-dialog-body" id="confirm-dialog-message">{message}</div>
        <footer className="confirm-dialog-footer">
          <button className="btn btn-secondary" disabled={loading} onClick={onClose}>{cancelLabel}</button>
          <button className={`btn ${isRestore ? "btn-primary" : "btn-danger"} confirm-dialog-action`} disabled={loading} onClick={onConfirm}>
            {loading ? <><Loader2 size={16} className="spin" /> Processing…</> : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
