import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

/** Shimmering placeholder blocks that mirror the final layout (no layout shift when data arrives). */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`rounded-md bg-surface-3/70 skeleton ${className}`}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
  className = '',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-1.5 py-8 ${className}`}
    >
      <div className="w-9 h-9 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center mb-1">
        {icon ?? <Inbox size={16} />}
      </div>
      <div className="text-[13px] font-medium text-ink-0">{title}</div>
      {hint && <div className="text-xs text-ink-1 max-w-[280px] leading-relaxed">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className = '',
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center gap-1.5 py-8 ${className}`}
    >
      <div className="w-9 h-9 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-1">
        <AlertTriangle size={16} />
      </div>
      <div className="text-[13px] font-medium text-ink-0">Couldn't load this</div>
      <div className="text-xs text-ink-1 max-w-[280px]">{message || 'Something went wrong.'}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-cyan border border-line rounded-md px-3 py-1.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  );
}
