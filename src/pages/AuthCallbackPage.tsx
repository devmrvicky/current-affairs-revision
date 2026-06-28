import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [session, navigate]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="text-center">
        {!timedOut ? (
          <>
            <Loader2 size={28} className="animate-spin mx-auto mb-4 text-brand-500" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Signing you in…</p>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              That's taking longer than expected.
            </p>
            <button onClick={() => navigate('/')} className="btn-primary text-sm py-2 px-5">
              Back to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
