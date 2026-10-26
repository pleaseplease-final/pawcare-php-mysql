import React from "react";
import { TriangleAlert } from "lucide-react";
import "./error-boundary.css";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PawCare UI Error:", error, errorInfo);
  }

  retry = () => this.setState({ hasError: false, error: null });

  goHome = () => {
    if (this.props.onReset) {
      this.props.onReset();
      this.retry();
      return;
    }
    // Recover the default workspace without deleting login tokens or other app data.
    try {
      const saved = JSON.parse(sessionStorage.getItem("pawcare_last_session_user") || "null");
      if (saved?.id != null) sessionStorage.removeItem(`pawcare_page_${saved.id}`);
    } catch (_) { /* Storage may be unavailable. Navigation still works. */ }
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className={`ui-recovery${this.props.inline ? " ui-recovery-inline" : ""}`} role="alert" aria-labelledby="recovery-title">
        <div className="ui-recovery-card">
          <span className="ui-recovery-icon"><TriangleAlert size={32} aria-hidden="true" /></span>
          <h2 id="recovery-title">We couldn’t open this page</h2>
          <p>Your saved records are still available. Please try again, or return to your home screen.</p>
          {import.meta.env.DEV && this.state.error && <details className="ui-recovery-details"><summary>Developer details</summary><pre>{String(this.state.error.message || this.state.error)}</pre></details>}
          <div className="ui-recovery-actions">
            <button className="btn gold" onClick={this.retry}>Try again</button>
            <button className="btn ghost" onClick={this.goHome}>{this.props.inline ? "Back to dashboard" : "Return home"}</button>
          </div>
        </div>
      </section>
    );
  }
}
