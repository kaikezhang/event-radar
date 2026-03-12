import { cn } from '../lib/utils.js';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-radar-border-bright border-t-radar-green" />
    </div>
  );
}

export function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="rounded-lg border border-radar-red/30 bg-radar-red/5 px-4 py-3 text-sm text-radar-red">
        {message}
      </div>
    </div>
  );
}
