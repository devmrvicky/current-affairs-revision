import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, Settings, BookOpen, Moon, Sun, Layers, Sparkles, ShieldCheck, ChevronDown, Target, ListChecks, Newspaper } from 'lucide-react';
import { useSettingsStore } from '../store/statsStore';
import { useAuthStore } from '../store/authStore';
import { useExamStore } from '../store/examStore';
import { examRegistry } from '../data/registry/examRegistry';
import { SyncStatusIndicator } from '../components/common/SyncStatusIndicator';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

// Reorganized around the universal exam-prep model, not Current Affairs
// (product-refactor §20/§77). "Practice" now correctly points at the actual
// Practice engine — it previously pointed at Wrong Questions, a leftover
// from before the Practice Configurator existed. History and Wrong
// Questions remain reachable via Home's Recent Activity and Review Center
// respectively; the primary dock only has room for the highest-traffic
// destinations.
const NAV = [
  { to: '/',                              icon: Home,          label: 'Home' },
  { to: '/practice/configure',            icon: Target,        label: 'Practice' },
  { to: '/mock-tests',                    icon: ListChecks,    label: 'Mock Test' },
  { to: '/chapters',                      icon: Layers,        label: 'Chapters' },
  { to: '/review-center',                 icon: Sparkles,      label: 'Review' },
  { to: '/current-affairs',               icon: Newspaper,     label: 'Current Affairs' },
  { to: '/statistics',                    icon: BarChart3,     label: 'Progress' },
  { to: '/settings',                      icon: Settings,      label: 'Settings' },
];

const ADMIN_NAV_ITEM = { to: '/admin', icon: ShieldCheck, label: 'Admin' };

export default function AppLayout() {
  const { settings, update } = useSettingsStore();
  const { isAdmin } = useAuthStore();
  const { selectedExamId } = useExamStore();
  const selectedExam = examRegistry.getExam(selectedExamId);
  const navigate = useNavigate();
  const location = useLocation();
  const isQuizPage = location.pathname === '/quiz' || location.pathname === '/analysis' || location.pathname === '/session'
    || /^\/mock-tests\/[^/]+\/session$/.test(location.pathname);
  const navItems = isAdmin ? [...NAV, ADMIN_NAV_ITEM] : NAV;
  const shouldReduceMotion = useReducedMotion();

  function toggleTheme() {
    update({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
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
              <span className="font-display font-bold text-lg hidden sm:inline" style={{ color: 'var(--text-primary)' }}>
                CurrentAffairs<span className="gradient-text">Pro</span>
              </span>
              <button
                onClick={() => navigate('/exams')}
                className="flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium max-w-[140px] sm:max-w-[180px] transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                title="Switch exam"
              >
                <span className="truncate">{selectedExam?.name ?? 'Choose Exam'}</span>
                <ChevronDown size={12} className="flex-shrink-0" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <SyncStatusIndicator />
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
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.15 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Nav */}
      {!isQuizPage && (
        <>
          {/* Mobile Bottom Nav — horizontally scrollable so all items stay reachable without clipping */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-[var(--border)]">
            <div
              className="flex items-stretch gap-0.5 h-16 px-1 overflow-x-auto no-scrollbar"
              style={{ scrollSnapType: 'x proximity' }}
            >
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 flex-shrink-0 min-w-[64px] ${
                      isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-600'
                    }`
                  }
                  style={{ scrollSnapAlign: 'center' }}
                >
                  {({ isActive }) => (
                    <>
                      <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-brand-100 dark:bg-brand-900/40' : ''}`}>
                        <Icon size={16} />
                      </div>
                      <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Desktop Sidebar */}
          <aside className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-1.5 card p-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2 p-3 rounded-xl transition-all duration-200 ${
                    isActive ? 'bg-brand-500 text-white shadow-glow' : 'hover:bg-gray-100 dark:hover:bg-white/10'
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
