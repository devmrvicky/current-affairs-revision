import { Cloud, CloudOff, RefreshCw, CloudUpload, AlertCircle } from 'lucide-react';
import { useSyncStatusStore } from '../../store/syncStatusStore';

/** Small cloud icon reflecting current sync state. Renders nothing if sync isn't relevant (signed out / not configured). */
export function SyncStatusIndicator({ showLabel = false }: { showLabel?: boolean }) {
  const { status, pendingCount } = useSyncStatusStore();

  if (status === 'disabled' || status === 'signed-out') return null;

  const config: Record<typeof status, { icon: React.ReactNode; label: string; color: string }> = {
    disabled: { icon: null, label: '', color: '' },
    'signed-out': { icon: null, label: '', color: '' },
    syncing: { icon: <RefreshCw size={13} className="animate-spin" />, label: 'Syncing…', color: 'var(--text-muted)' },
    synced: { icon: <Cloud size={13} />, label: 'Synced', color: '#22c55e' },
    pending: { icon: <CloudUpload size={13} />, label: `${pendingCount} pending`, color: '#f59e0b' },
    offline: { icon: <CloudOff size={13} />, label: 'Offline', color: 'var(--text-muted)' },
    error: { icon: <AlertCircle size={13} />, label: 'Sync issue', color: '#ef4444' },
  };

  const { icon, label, color } = config[status];

  return (
    <div className="flex items-center gap-1.5" style={{ color }} title={label}>
      {icon}
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </div>
  );
}
