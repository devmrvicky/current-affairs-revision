import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import toast from 'react-hot-toast';

// ─── Install Banner ───────────────────────────────────────────────────────────
// Shows when the browser fires the beforeinstallprompt event.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    function handlePrompt(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function triggerInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  }

  return { canInstall: !!installPrompt && !isInstalled, triggerInstall, isInstalled };
}

export function PWAInstallBanner() {
  const { canInstall, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('pwa-banner-dismissed') === '1'
  );

  function dismiss() {
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', '1');
  }

  return (
    <AnimatePresence>
      {canInstall && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="card p-4 flex items-center gap-3 border-l-4 border-l-brand-500"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
            <Download size={18} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Install App
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Add to home screen for offline access & faster loads
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={triggerInstall}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── SW Update Notifier ───────────────────────────────────────────────────────
// Renders nothing visually — fires a toast when a new SW version is ready.

export function PWAUpdateNotifier() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      // Periodically check for updates every hour
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast(
      (t) => (
        <div className="flex items-center gap-3">
          <RefreshCw size={16} className="text-brand-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">New version available</p>
            <p className="text-xs opacity-70">Reload to get the latest features</p>
          </div>
          <button
            onClick={() => { updateServiceWorker(true); toast.dismiss(t.id); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors flex-shrink-0"
          >
            Update
          </button>
        </div>
      ),
      { duration: Infinity, id: 'pwa-update' }
    );
  }, [needRefresh]);

  return null;
}
