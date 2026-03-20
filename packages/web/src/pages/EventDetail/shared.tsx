export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-overlay-medium bg-bg-elevated/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-6 text-text-primary">{value}</p>
    </div>
  );
}

export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">{title}</h2>
    </div>
  );
}
