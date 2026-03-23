import { cn } from '../lib/utils.js';

interface DirectionBadgeProps {
  direction: 'bullish' | 'bearish' | 'neutral' | string;
  confidence?: number | null;
  confidenceBucket?: string | null;
  size?: 'sm' | 'md';
}

const directionConfig: Record<string, { icon: string; label: string; classes: string }> = {
  bullish: {
    icon: '▲',
    label: 'BULLISH',
    classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  bearish: {
    icon: '▼',
    label: 'BEARISH',
    classes: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
  neutral: {
    icon: '●',
    label: 'NEUTRAL',
    classes: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  },
};

function getConfidenceLabel(
  confidence?: number | null,
  confidenceBucket?: string | null,
): { text: string; high: boolean; low: boolean } | null {
  if (confidenceBucket === 'high' || (confidence != null && confidence >= 0.8)) {
    return { text: 'High conf', high: true, low: false };
  }
  if (confidenceBucket === 'medium' || (confidence != null && confidence >= 0.6)) {
    return { text: 'Moderate', high: false, low: false };
  }
  if (confidenceBucket === 'low' || (confidence != null && confidence < 0.6)) {
    return { text: 'Speculative', high: false, low: true };
  }
  return null;
}

export function DirectionBadge({ direction, confidence, confidenceBucket, size = 'sm' }: DirectionBadgeProps) {
  const config = directionConfig[direction.toLowerCase()] ?? directionConfig.neutral;
  const conf = getConfidenceLabel(confidence, confidenceBucket);
  const tooltip = 'Bullish = Expected to push price UP, Bearish = Expected to push price DOWN';

  return (
    <div
      className={cn(
        'inline-flex flex-col items-center justify-center rounded-lg border',
        config.classes,
        conf?.low && 'border-dashed opacity-70',
        size === 'sm' ? 'w-[100px] px-2 py-1.5' : 'w-[120px] px-3 py-2',
      )}
      title={tooltip}
    >
      <span className={cn('font-semibold tracking-wide', size === 'sm' ? 'text-[11px]' : 'text-xs')}>
        {config.icon} {config.label}
      </span>
      {conf && (
        <span
          className={cn(
            'mt-0.5 text-[10px]',
            conf.high ? 'opacity-100' : 'opacity-60',
          )}
        >
          {conf.text}
        </span>
      )}
    </div>
  );
}
