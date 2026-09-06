import { AlertCircle, RefreshCw } from "lucide-react";
import React from "react";

export function PageLoader({ label = "Loading data…" }) {
  return (
    <div className="async-state" role="status" aria-live="polite">
      <div className="async-loader-orbit"><div className="async-loader-dot" /></div>
      <strong>{label}</strong>
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
