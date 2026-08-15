import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Replaces the full-page card below. Used for failures that only cost the user one
  // part of the app, where taking the whole thing down would be the larger loss.
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error);
    }

    return (
      <div className="d-flex justify-content-center align-items-start pt-5 min-vh-100">
        <div className="card shadow-sm" style={{ maxWidth: 520, width: '100%', margin: '0 1rem' }}>
          <div className="card-body p-4">
            <div className="fs-1 mb-3" aria-hidden="true">⚠️</div>
            <h1 className="h5 mb-1">Något gick fel</h1>
            <p className="text-body-secondary mb-1">Something went wrong</p>
            <p className="text-body-secondary mb-1">Bir şeyler ters gitti</p>
            <p className="text-body-secondary mb-4">エラーが発生しました</p>
            <button className="btn btn-primary mb-4" onClick={() => window.location.reload()}>
              Ladda om / Reload
            </button>
            <details>
              <summary className="text-body-secondary small" style={{ cursor: 'pointer' }}>
                Teknisk information / Technical details
              </summary>
              <pre className="mt-2 p-2 bg-body-secondary rounded small overflow-auto"
                   style={{ maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.message}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
