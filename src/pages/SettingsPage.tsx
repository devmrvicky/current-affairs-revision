import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Moon, Sun, Monitor, Volume2, VolumeX, Save, Eye,
  Keyboard, Settings, BookOpen, Bell, BellOff, Target,
  Clock, Flame, AlertTriangle, CheckCircle2, Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../store/statsStore';
import { useNotificationStore } from '../store/notificationStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { AccountSyncCard } from '../components/auth/AccountSyncCard';
import type { Settings as SettingsType } from '../types';

interface ToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

function Toggle({ enabled, onChange, label, description, icon, disabled }: ToggleProps) {
  return (
    <div className={`flex items-center justify-between py-4 border-b border-[var(--border)] last:border-0 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--border)' }}>
            {icon}
          </div>
        )}
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
        </div>
      </div>
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
          enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

interface ThemeButtonProps {
  label: string;
  value: SettingsType['theme'];
  icon: React.ReactNode;
  current: SettingsType['theme'];
  onClick: () => void;
}

function ThemeButton({ label, value, icon, current, onClick }: ThemeButtonProps) {
  const isActive = current === value;
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all ${
        isActive
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-[var(--border)] hover:border-brand-300'
      }`}
    >
      <div className={isActive ? 'text-brand-500' : ''} style={!isActive ? { color: 'var(--text-secondary)' } : undefined}>
        {icon}
      </div>
      <span className={`text-sm font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : ''}`}
        style={!isActive ? { color: 'var(--text-secondary)' } : undefined}>
        {label}
      </span>
      {isActive && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-medium">
          Active
        </span>
      )}
    </button>
  );
}

function CategoryRow({ label, enabled, onChange, disabled }: { label: string; enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
          enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        role="switch"
        aria-checked={enabled}
        aria-label={label}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

const NOTIFICATION_CATEGORY_GROUPS: { title: string; items: { key: keyof import('../types').NotificationCategorySettings; label: string }[] }[] = [
  {
    title: 'Daily Reminders',
    items: [
      { key: 'dailyQuizReminder', label: "Today's quiz reminder" },
      { key: 'dailyRevisionReminder', label: 'Daily revision reminder' },
      { key: 'continueReadingReminder', label: 'Continue reading reminder' },
      { key: 'resumePreviousTest', label: 'Resume previous test' },
      { key: 'incompleteTestReminder', label: 'Incomplete test reminder' },
    ],
  },
  {
    title: 'Progress & Streaks',
    items: [
      { key: 'studyStreak', label: 'Study streak milestones' },
      { key: 'weeklyProgress', label: 'Weekly progress' },
      { key: 'monthlySummary', label: 'Monthly summary' },
      { key: 'revisionTargetCompleted', label: 'Daily goal completed' },
    ],
  },
  {
    title: 'Tests & Chapters',
    items: [
      { key: 'testCompleted', label: 'Test completed' },
      { key: 'chapterCompleted', label: 'Chapter completed' },
      { key: 'achievementUnlocked', label: 'Achievement unlocked' },
      { key: 'newChapterAdded', label: 'New chapter added' },
    ],
  },
  {
    title: 'Revision Health',
    items: [
      { key: 'wrongQuestionReview', label: 'Wrong question review due' },
      { key: 'missedRevision', label: 'Missed revision' },
      { key: 'longTimeNoStudy', label: "Haven't studied in a while" },
    ],
  },
];

export default function SettingsPage() {
  const { settings, load: loadSettings, update } = useSettingsStore();
  const {
    settings: notifSettings, permissionState,
    load: loadNotif, save: saveNotif, setCategory: setNotifCategory, requestPermission
  } = useNotificationStore();
  const { goal, load: loadGoal, setTarget } = useDailyGoalStore();
  const [requestingPermission, setRequestingPermission] = useState(false);

  useEffect(() => {
    loadSettings();
    loadNotif();
    loadGoal();
  }, []);

  function handleSettingChange(patch: Partial<SettingsType>) {
    update(patch);
    toast.success('Settings saved', { duration: 1500 });
  }

  async function handleNotifToggle(enabled: boolean) {
    if (enabled && permissionState !== 'granted') {
      setRequestingPermission(true);
      const granted = await requestPermission();
      setRequestingPermission(false);
      if (!granted) {
        toast.error('Notification permission denied. Enable in browser settings.');
        return;
      }
    }
    await saveNotif({ enabled });
    toast.success(enabled ? 'Notifications enabled' : 'Notifications disabled', { duration: 1500 });
  }

  async function handleGoalChange(target: number) {
    await setTarget(target);
    toast.success(`Daily goal set to ${target} questions`, { duration: 1500 });
  }

  const fontSizes: { value: SettingsType['fontSize']; label: string }[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
  ];

  const autoNextOptions: { value: SettingsType['autoNextSeconds']; label: string }[] = [
    { value: 0, label: 'Off' },
    { value: 2, label: '2s' },
    { value: 3, label: '3s' },
    { value: 5, label: '5s' },
  ];

  const goalOptions = [10, 25, 50, 100];
  const notifSupported = permissionState !== 'unsupported';

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-white/10 flex items-center justify-center">
          <Settings size={20} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Customize your experience</p>
        </div>
      </div>

      {/* Account & Sync */}
      <AccountSyncCard />

      {/* Theme */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Appearance</h2>
        <div className="flex gap-3 mb-5">
          <ThemeButton label="Light" value="light" current={settings.theme} icon={<Sun size={22} />} onClick={() => handleSettingChange({ theme: 'light' })} />
          <ThemeButton label="Dark" value="dark" current={settings.theme} icon={<Moon size={22} />} onClick={() => handleSettingChange({ theme: 'dark' })} />
          <ThemeButton label="System" value="system" current={settings.theme} icon={<Monitor size={22} />} onClick={() => handleSettingChange({ theme: 'system' })} />
        </div>
        <div>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Font Size</p>
          <div className="flex gap-2">
            {fontSizes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSettingChange({ fontSize: value })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  settings.fontSize === value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                    : 'border-[var(--border)] hover:border-brand-300'
                }`}
                style={settings.fontSize !== value ? { color: 'var(--text-secondary)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Goal */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={18} className="text-brand-500" />
          <h2 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Daily Goal</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Set your daily question target. Current: <strong>{goal?.questionsToday ?? 0}/{goal?.target ?? 25}</strong> questions today.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {goalOptions.map((target) => (
            <button
              key={target}
              onClick={() => handleGoalChange(target)}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                goal?.target === target
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                  : 'border-[var(--border)] hover:border-brand-300'
              }`}
              style={goal?.target !== target ? { color: 'var(--text-secondary)' } : undefined}
            >
              {target}
            </button>
          ))}
        </div>
        {goal && goal.streakDays > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Flame size={14} className="text-amber-500" />
            <span style={{ color: 'var(--text-secondary)' }}>
              Goal streak: <strong className="text-amber-600 dark:text-amber-400">{goal.streakDays} days</strong>
              {' · '}Best: <strong>{goal.bestStreakDays} days</strong>
            </span>
          </div>
        )}
      </div>

      {/* Quiz Preferences */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Quiz Preferences</h2>
        <Toggle
          enabled={settings.showExplanation}
          onChange={(v) => handleSettingChange({ showExplanation: v })}
          label="Show Explanations"
          description="Display explanation after each answer"
          icon={<Eye size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <Toggle
          enabled={settings.autoSave}
          onChange={(v) => handleSettingChange({ autoSave: v })}
          label="Auto Save Session"
          description="Automatically save quiz progress"
          icon={<Save size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <Toggle
          enabled={settings.keyboardNavigation}
          onChange={(v) => handleSettingChange({ keyboardNavigation: v })}
          label="Keyboard Navigation"
          description="Use A/B/C/D or 1/2/3/4 keys to answer"
          icon={<Keyboard size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <div className="py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--border)' }}>
              <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Auto Next Question</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Automatically advance after answering</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {autoNextOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSettingChange({ autoNextSeconds: value })}
                className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                  settings.autoNextSeconds === value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                    : 'border-[var(--border)] hover:border-brand-300'
                }`}
                style={settings.autoNextSeconds !== value ? { color: 'var(--text-secondary)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          enabled={settings.soundEnabled}
          onChange={(v) => handleSettingChange({ soundEnabled: v })}
          label="Sound Effects"
          description="Play sounds for correct / wrong answers"
          icon={settings.soundEnabled
            ? <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
            : <VolumeX size={16} style={{ color: 'var(--text-secondary)' }} />
          }
        />
        <Toggle
          enabled={settings.hapticEnabled !== false}
          onChange={(v) => handleSettingChange({ hapticEnabled: v })}
          label="Haptic Feedback"
          description="Vibrate on answer selection (this device only)"
          icon={<Smartphone size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
      </div>

      {/* Notifications */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={18} className="text-brand-500" />
          <h2 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</h2>
        </div>

        {!notifSupported && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-3 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Notifications not supported in this browser.
            </p>
          </div>
        )}

        {notifSupported && permissionState === 'denied' && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-3 bg-red-50 dark:bg-red-900/20">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">
              Permission blocked. Enable notifications in your browser/app settings.
            </p>
          </div>
        )}

        {notifSupported && permissionState === 'granted' && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-3 bg-green-50 dark:bg-green-900/20">
            <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">
              Notification permission granted.
            </p>
          </div>
        )}

        <Toggle
          enabled={notifSettings.enabled}
          onChange={handleNotifToggle}
          label="Enable Notifications"
          description="Master switch for every reminder and alert below"
          icon={notifSettings.enabled
            ? <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
            : <BellOff size={16} style={{ color: 'var(--text-secondary)' }} />
          }
          disabled={!notifSupported || requestingPermission}
        />

        {notifSettings.enabled && (
          <div className="flex items-center justify-between py-3 pl-12 border-b border-[var(--border)]">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Reminder time</span>
            <input
              type="time"
              value={notifSettings.reminderTime}
              onChange={(e) => saveNotif({ reminderTime: e.target.value })}
              className="text-sm font-medium rounded-lg px-2 py-1 border outline-none focus:border-brand-400"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        <Toggle
          enabled={notifSettings.quietHoursEnabled}
          onChange={(v) => saveNotif({ quietHoursEnabled: v })}
          label="Quiet Hours"
          description={`No notifications between ${notifSettings.quietHoursStart} and ${notifSettings.quietHoursEnd}`}
          icon={<Clock size={16} style={{ color: 'var(--text-secondary)' }} />}
          disabled={!notifSettings.enabled}
        />
        {notifSettings.enabled && notifSettings.quietHoursEnabled && (
          <div className="flex items-center justify-between gap-3 py-3 pl-12 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={notifSettings.quietHoursStart}
                onChange={(e) => saveNotif({ quietHoursStart: e.target.value })}
                className="text-sm font-medium rounded-lg px-2 py-1 border outline-none focus:border-brand-400"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
              <input
                type="time"
                value={notifSettings.quietHoursEnd}
                onChange={(e) => saveNotif({ quietHoursEnd: e.target.value })}
                className="text-sm font-medium rounded-lg px-2 py-1 border outline-none focus:border-brand-400"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        )}

        <Toggle
          enabled={notifSettings.soundEnabled}
          onChange={(v) => saveNotif({ soundEnabled: v })}
          label="Sound"
          icon={notifSettings.soundEnabled
            ? <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
            : <VolumeX size={16} style={{ color: 'var(--text-secondary)' }} />
          }
          disabled={!notifSettings.enabled}
        />
        <Toggle
          enabled={notifSettings.vibrationEnabled}
          onChange={(v) => saveNotif({ vibrationEnabled: v })}
          label="Vibration"
          icon={<Smartphone size={16} style={{ color: 'var(--text-secondary)' }} />}
          disabled={!notifSettings.enabled}
        />

        {notifSettings.enabled && (
          <div className="mt-2">
            {NOTIFICATION_CATEGORY_GROUPS.map((group) => (
              <div key={group.title} className="mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide pt-4 pb-1" style={{ color: 'var(--text-muted)' }}>
                  {group.title}
                </p>
                <div className="divide-y divide-[var(--border)]">
                  {group.items.map((item) => (
                    <CategoryRow
                      key={item.key}
                      label={item.label}
                      enabled={notifSettings.categories[item.key]}
                      onChange={(v) => setNotifCategory(item.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Push (closed-app) info */}
        <div className="mt-4 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>NOTIFICATIONS WHEN THE APP IS CLOSED</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Everything above works while the app is open. For reminders to reach you while it's closed, set{' '}
            <code className="px-1 rounded text-brand-500" style={{ background: 'var(--border)' }}>VITE_VAPID_PUBLIC_KEY</code>{' '}
            and deploy the scheduled push function — see README.
          </p>
        </div>
      </div>

      {/* PWA / Install */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone size={18} className="text-brand-500" />
          <h2 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>App & PWA</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          This app is a Progressive Web App. Install it on your device for offline access and a native app experience.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {['Offline Support', 'Home Screen Icon', 'Fast Loading', 'Push Notifications', 'Android APK via PWA Builder'].map((f) => (
            <span key={f} className="px-2.5 py-1 rounded-lg font-medium"
              style={{ background: '#6366f118', color: '#6366f1' }}>
              ✓ {f}
            </span>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>About</h2>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow">
            <BookOpen size={18} className="text-white" />
          </div>
          <div>
            <p className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>ExamVerse</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Prepare. Practice. Perform. • Version 2.0.0 • PWA-ready</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['React 19', 'TypeScript', 'Zustand', 'IndexedDB', 'Framer Motion', 'Workbox PWA', 'Recharts'].map((tag) => (
            <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
