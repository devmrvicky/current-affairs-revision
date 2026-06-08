import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  bgColor?: string;
  trend?: { value: number; label: string };
  delay?: number;
}

export function StatCard({ label, value, icon: Icon, color = '#6366f1', bgColor, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card p-5 flex items-center gap-4"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: bgColor ?? `${color}18` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
      </div>
    </motion.div>
  );
}

interface DashboardCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  gradient: string;
  onClick: () => void;
  badge?: string;
  delay?: number;
  disabled?: boolean;
}

export function DashboardCard({
  title, description, icon: Icon, color, gradient, onClick, badge, delay = 0, disabled
}: DashboardCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="card p-6 text-left w-full relative overflow-hidden group transition-shadow hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Gradient background effect */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: gradient }}
      />

      <div className="relative">
        {badge && (
          <span className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: color }}>
            {badge}
          </span>
        )}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
          style={{ background: `${color}20` }}
        >
          <Icon size={24} style={{ color }} />
        </div>
        <h3 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
    </motion.button>
  );
}
