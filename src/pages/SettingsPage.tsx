import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Moon, Sun, Monitor, Volume2, VolumeX, Save, Eye, EyeOff,
  Keyboard, Type, Settings, Info, BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../store/statsStore';
import type { Settings as SettingsType } from '../types';

interface ToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

function Toggle({ enabled, onChange, label, description, icon }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--border)] last:border-0">
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
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
          enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
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
          : 'border-[var(--border)] hover:border-brand-300 hover:bg-gray-50 dark:hover:bg-white/5'
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

export default function SettingsPage() {
  const { settings, load, update } = useSettingsStore();

  useEffect(() => { load(); }, []);

  function handleChange(patch: Partial<SettingsType>) {
    update(patch);
    toast.success('Settings saved', { duration: 1500 });
  }

  const fontSizes: { value: SettingsType['fontSize']; label: string }[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
  ];

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

      {/* Theme */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Appearance</h2>
        <div className="flex gap-3 mb-5">
          <ThemeButton
            label="Light" value="light" current={settings.theme}
            icon={<Sun size={22} />}
            onClick={() => handleChange({ theme: 'light' })}
          />
          <ThemeButton
            label="Dark" value="dark" current={settings.theme}
            icon={<Moon size={22} />}
            onClick={() => handleChange({ theme: 'dark' })}
          />
          <ThemeButton
            label="System" value="system" current={settings.theme}
            icon={<Monitor size={22} />}
            onClick={() => handleChange({ theme: 'system' })}
          />
        </div>

        {/* Font Size */}
        <div>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Font Size</p>
          <div className="flex gap-2">
            {fontSizes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleChange({ fontSize: value })}
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

      {/* Quiz Preferences */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Quiz Preferences</h2>

        <Toggle
          enabled={settings.showExplanation}
          onChange={(v) => handleChange({ showExplanation: v })}
          label="Show Explanations"
          description="Display explanation after each answer"
          icon={<Eye size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <Toggle
          enabled={settings.autoSave}
          onChange={(v) => handleChange({ autoSave: v })}
          label="Auto Save Session"
          description="Automatically save quiz progress"
          icon={<Save size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <Toggle
          enabled={settings.keyboardNavigation}
          onChange={(v) => handleChange({ keyboardNavigation: v })}
          label="Keyboard Navigation"
          description="Use A/B/C/D or 1/2/3/4 keys to answer"
          icon={<Keyboard size={16} style={{ color: 'var(--text-secondary)' }} />}
        />
        <Toggle
          enabled={settings.soundEnabled}
          onChange={(v) => handleChange({ soundEnabled: v })}
          label="Sound Effects"
          description="Play sounds for correct / wrong answers"
          icon={settings.soundEnabled
            ? <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
            : <VolumeX size={16} style={{ color: 'var(--text-secondary)' }} />
          }
        />
      </div>

      {/* About */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>About</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <p className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>CurrentAffairsPro</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Version 1.0.0 • Built for aspirants</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A production-grade current affairs revision platform. All data is stored locally on your device
            using IndexedDB — no account required, no data sent to servers.
          </p>
          <div className="flex flex-wrap gap-2">
            {['React 19', 'TypeScript', 'Zustand', 'IndexedDB', 'Framer Motion', 'Recharts'].map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
