import React from 'react';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unconfirmed';

interface ConfidenceBadgeProps {
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Optional confidence level override (derived from confidence) */
  level?: ConfidenceLevel;
  /** Show numeric confidence value */
  showValue?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional className for styling */
  className?: string;
}

/**
 * Derive confidence level from numeric score.
 */
export function deriveConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'unconfirmed';
}

/**
 * Confidence Badge UI component.
 * Shows visual indicator based on classification confidence.
 *
 * - confidence >= 0.7: ✅ Confirmed (green)
 * - confidence 0.5-0.7: ⚠️ Medium (yellow/orange)
 * - confidence 0.3-0.5: 🔶 Low (orange)
 * - confidence < 0.3: 🔍 Unconfirmed (gray)
 */
export function ConfidenceBadge({
  confidence,
  level: explicitLevel,
  showValue = false,
  size = 'md',
  className = '',
}: ConfidenceBadgeProps) {
  const level = explicitLevel ?? deriveConfidenceLevel(confidence);

  const config = {
    high: {
      icon: '✅',
      label: 'Confirmed',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-200',
    },
    medium: {
      icon: '⚠️',
      label: 'Medium',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-200',
    },
    low: {
      icon: '🔶',
      label: 'Low',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-800',
      borderColor: 'border-orange-200',
    },
    unconfirmed: {
      icon: '🔍',
      label: 'Unconfirmed',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
      borderColor: 'border-gray-200',
    },
  };

  const { icon, label, bgColor, textColor, borderColor } = config[level];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${bgColor} ${textColor} ${borderColor}
        ${sizeClasses[size]}
        ${className}
      `}
      title={`Confidence: ${(confidence * 100).toFixed(0)}%`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {showValue && (
        <span className="opacity-75 ml-1">
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}

/**
 * Compact confidence indicator (just the icon and tooltip).
 */
export function ConfidenceIndicator({
  confidence,
  size = 'md',
}: {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const level = deriveConfidenceLevel(confidence);

  const icons = {
    high: '✅',
    medium: '⚠️',
    low: '🔶',
    unconfirmed: '🔍',
  };

  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <span
      className={`inline-block ${sizes[size]}`}
      title={`Confidence: ${(confidence * 100).toFixed(0)}%`}
    >
      {icons[level]}
    </span>
  );
}
