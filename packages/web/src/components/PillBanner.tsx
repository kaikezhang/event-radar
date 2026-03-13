export function PillBanner({
  count,
  onApply,
}: {
  count: number;
  onApply: () => void;
}) {
  return (
    <div className="sticky top-3 z-20 flex justify-center" role="status" aria-live="polite">
      <button
        type="button"
        onClick={onApply}
        className="inline-flex min-h-11 items-center rounded-full border border-accent-default/35 bg-accent-default px-4 py-2 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(59,130,246,0.28)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default focus:ring-offset-2 focus:ring-offset-bg-primary"
      >
        {count} new alerts
      </button>
    </div>
  );
}
