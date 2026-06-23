import { useNavigate, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

/**
 * Used as `errorElement` on router routes. Catches thrown errors during
 * render (missing data, corrupted JSON/markdown, unexpected exceptions) so
 * a single broken chapter/test never takes down the whole app.
 */
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let message = 'An unexpected error occurred.';
  if (isRouteErrorResponse(error)) {
    message = error.statusText || `Error ${error.status}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Something went wrong
        </h2>
        <p className="text-sm mb-6 break-words" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="btn-secondary flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <RotateCcw size={15} /> Try Again
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Home size={15} /> Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
