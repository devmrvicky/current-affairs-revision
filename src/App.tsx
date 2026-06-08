import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import AppRouter from './routes/AppRouter';
import { useSettingsStore, applyTheme } from './store/statsStore';

function App() {
  const { load, settings } = useSettingsStore();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  return (
    <>
      <AppRouter />
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
