import { AlertCircle, RefreshCw } from "lucide-react";
import React from "react";

export function LoadingVisual({ label = "Loading data…", compact = false }) {
  return (
    <div className={`dashboard-chart-loading shared-loading-visual ${compact ? "shared-loading-compact" : ""}`} role="status" aria-live="polite">
      <div className="dashboard-chart-loading-header"><span className="dashboard-chart-loading-title" /><span className="dashboard-chart-loading-chip" /></div>
      <div className="dashboard-chart-loading-body">
        <span className="dashboard-chart-axis y" />
        <div className="dashboard-chart-bars">{[38, 62, 48, 78, 55, 86, 68].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
        <span className="dashboard-chart-axis x" />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function PageLoader({ label = "Loading data…" }) {
  return (
    <div className="async-state" role="status" aria-live="polite">
      <LoadingVisual label={label} compact />
      <span>Please wait a moment.</span>
    </div>
  );
}

export function PageError({ message = "We could not load this page.", onRetry }) {
  return (
    <div className="async-state async-error" role="alert">
      <div className="async-error-icon"><AlertCircle size={25} /></div>
      <strong>Something went wrong</strong>
      <span>{message}</span>
      {onRetry && <button className="btn btn-primary async-retry" onClick={onRetry}><RefreshCw size={16} /> Try again</button>}
    </div>
  );
}

export class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Application render error:", error); }
  render() {
    if (this.state.error) return <PageError message="An unexpected screen error occurred. Refresh the page or try again." onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
