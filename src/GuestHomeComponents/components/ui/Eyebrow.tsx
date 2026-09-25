import { cn } from '../../lib/utils';
const toneClasses = {
  cyan: 'text-accent-cyan',
  green: 'text-accent-green',
  blue: 'text-accent-blue',
};
export function Eyebrow({ children, tone = 'cyan', className }) {
  return (
    <p
      className={cn(
        'font-mono text-xs font-medium uppercase tracking-[0.2em]',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </p>
  );
}
