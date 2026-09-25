import { cn } from '../../lib/utils';
export function Button({ variant = 'solid', icon, children, className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-accent-cyan',
        variant === 'solid' && 'bg-ink-0 text-surface-0 hover:bg-white',
        variant === 'ghost' &&
          'border border-line text-ink-0 hover:border-ink-1 hover:bg-surface-2',
        className
      )}
      {...props}
    >
      {children}
      {icon}
    </button>
  );
}
