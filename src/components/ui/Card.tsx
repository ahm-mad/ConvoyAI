import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * Card primitives (replace MUI Card/CardContent/CardActions). `sx` is accepted for call-site compatibility but
 * ignored: surfaces come from the design tokens (`glass`).
 */
type Props = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  sx?: unknown;
  style?: CSSProperties;
};

export function Card({ className = '', sx: _sx, children, ...rest }: Props) {
  return (
    <div className={`glass w-full overflow-visible ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardContent({ className = '', sx: _sx, children, ...rest }: Props) {
  return (
    <div className={`p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardActions({ className = '', sx: _sx, children, ...rest }: Props) {
  return (
    <div className={`flex items-center gap-2 px-6 pb-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
