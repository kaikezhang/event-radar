export function StatCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
      <div className="font-mono text-2xl font-semibold text-text-primary">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </div>
  );
}
