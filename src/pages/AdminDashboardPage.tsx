import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users, Activity, Calendar, TrendingUp, ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase, SUPABASE_ENABLED } from '../services/supabaseClient';
import { EmptyState } from '../components/common/EmptyState';

interface AdminStats {
  total_users: number;
  active_now: number;
  active_today: number;
  signups_last_7d: number;
  logins_last_7d: number;
}

interface DailyActivity {
  day: string;
  signups: number;
  logins: number;
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </div>
        <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value.toLocaleString('en-IN')}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { isAdmin, isInitializing } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitializing || !isAdmin) { setIsLoading(false); return; }
    (async () => {
      setIsLoading(true);
      const [statsRes, activityRes] = await Promise.all([
        supabase.rpc('get_admin_stats'),
        supabase.rpc('get_admin_daily_activity'),
      ]);

      if (statsRes.error) setError(statsRes.error.message);
      else setStats((statsRes.data?.[0] as AdminStats) ?? null);

      if (!activityRes.error && activityRes.data) {
        setActivity(
          (activityRes.data as { day: string; signups: number; logins: number }[]).map((d) => ({
            day: new Date(d.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            signups: d.signups,
            logins: d.logins,
          }))
        );
      }
      setIsLoading(false);
    })();
  }, [isInitializing, isAdmin]);

  if (!SUPABASE_ENABLED) {
    return (
      <EmptyState
        icon={<ShieldAlert size={28} style={{ color: 'var(--text-muted)' }} />}
        title="Sync not configured"
        description="The admin dashboard needs a configured Supabase backend."
      />
    );
  }

  if (isInitializing) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <EmptyState
          icon={<ShieldAlert size={28} className="text-red-400" />}
          title="Admin access only"
          description="You don't have permission to view this page."
          action={
            <button onClick={() => navigate('/')} className="btn-primary mt-4 text-sm py-2 px-5">
              Back to Home
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <Activity size={20} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Admin Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>User activity at a glance</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="card h-24 shimmer" style={{ background: 'var(--border)' }} />)}
        </div>
      ) : error ? (
        <EmptyState icon={<ShieldAlert size={28} className="text-red-400" />} title="Couldn't load stats" description={error} />
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users size={15} />} label="Total Users" value={stats.total_users} accent="#6366f1" />
            <StatCard icon={<Activity size={15} />} label="Active Now" value={stats.active_now} accent="#22c55e" />
            <StatCard icon={<Calendar size={15} />} label="Active Today" value={stats.active_today} accent="#f59e0b" />
            <StatCard icon={<TrendingUp size={15} />} label="Signups (7d)" value={stats.signups_last_7d} accent="#ec4899" />
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Signups & Logins — Last 30 Days
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="signups" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="logins" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
