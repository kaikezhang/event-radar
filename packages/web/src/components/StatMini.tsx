import { cn } from '../lib/utils.js';

export function StatMini({ label, value, tone }: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <div className="rounded-xl border border-overlay-medium bg-bg-elevated/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</p>
      <p className={cn(
        'mt-1 font-mono text-sm font-medium',
        tone === 'positive' ? 'text-emerald-400' :
        tone === 'negative' ? 'text-red-400' : 'text-text-primary'
      )}>{value}</p>
    </div>
  );
}
