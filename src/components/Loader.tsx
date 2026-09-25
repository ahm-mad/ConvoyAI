import { Loader2 } from 'lucide-react';

/** Small spinner (replaces MUI CircularProgress). */
export default function Loader({
  size = 18,
  className = '',
}: {
  size?: number;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}) {
  return (
    <Loader2 size={size} className={`animate-spin text-brand ${className}`} aria-label="Loading" />
  );
}
