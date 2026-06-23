import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last-resort safety net. React Router's per-route `errorElement` (see
 * RouteErrorBoundary.tsx) catches most render-time errors inside routed
 * pages; this catches anything outside that tree (e.g. providers, layout
 * chrome) so the app never goes to a blank white screen.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[GlobalErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h2 className="text-lg font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Something went wrong
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              The app hit an unexpected error. Your saved data is safe — reloading usually fixes this.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 mx-auto"
            >
              <RotateCcw size={15} /> Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
