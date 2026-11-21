import { useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import AppRouter from './routes/AppRouter';
import { useSettingsStore, applyTheme } from './store/statsStore';
import { useAuthStore } from './store/authStore';
import { initSyncListeners } from './services/syncService';
import { PWAUpdateNotifier } from './components/common/PWAComponents';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { syncQuestionBankOnStart } from './services/questionBank/startup';

function App() {
  const { load, settings } = useSettingsStore();
  const { init: initAuth } = useAuthStore();

  useEffect(() => { load(); }, []);
  useEffect(() => { applyTheme(settings.theme); }, [settings.theme]);
  useEffect(() => {
    initAuth();
    initSyncListeners();
  }, []);
  // Published question-bank tests: what is cached works immediately; check for updates quietly once the app has settled.
  useEffect(() => {
    const t = setTimeout(() => { void syncQuestionBankOnStart((m) => toast(m, { icon: '📚' })); }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <GlobalErrorBoundary>
        <AppRouter />
      </GlobalErrorBoundary>
      <PWAUpdateNotifier />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </>
  );
}

export default App;
