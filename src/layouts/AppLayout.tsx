import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Clock, BarChart3, Settings, BookOpen, Moon, Sun, Calendar, Brain } from 'lucide-react';
import { useSettingsStore } from '../store/statsStore';
import { motion, AnimatePresence } from 'framer-motion';

const NAV = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/revision-calendar', icon: Calendar, label: 'Calendar' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/wrong-questions', icon: Brain, label: 'Practice' },
  { to: '/statistics', icon: BarChart3, label: 'Stats' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout() {
  const { settings, update } = useSettingsStore();
  const location = useLocation();
  const isQuizPage = location.pathname.startsWith('/quiz') || location.pathname === '/analysis';

  function toggleTheme() {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    update({ theme: next });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Top Header */}
      {!isQuizPage && (
        <header className="sticky top-0 z-40 glass border-b border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-purple-600 rounded-lg flex items-center justify-center shadow-glow">
                <BookOpen size={16} className="text-white" />
              </div>
              <span className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                CurrentAffairs<span className="gradient-text">Pro</span>
              </span>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Toggle theme"
            >
              {settings.theme === 'dark'
                ? <Sun size={18} className="text-amber-400" />
                : <Moon size={18} style={{ color: 'var(--text-secondary)' }} />
              }
            </button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Nav (hidden on quiz/analysis) */}
      {!isQuizPage && (
        <>
          {/* Mobile Bottom Nav */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-[var(--border)]">
            <div className="flex items-center justify-around px-1 h-16">
              {NAV.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-200 ${
                      isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-600'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-brand-100 dark:bg-brand-900/40' : ''}`}>
                        <Icon size={17} />
                      </div>
                      <span className="text-[10px] font-medium leading-none">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Desktop Sidebar */}
          <aside className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-1.5 card p-2">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2 p-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-glow'
                      : 'hover:bg-gray-100 dark:hover:bg-white/10'
                  }`
                }
                title={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} style={!isActive ? { color: 'var(--text-secondary)' } : undefined} />
                    <span
                      className="absolute left-full ml-3 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-lg"
                      style={{ background: 'var(--card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </aside>
        </>
      )}
    </div>
  );
}
