import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * ConvoyAI button. Renders a plain <button> styled from design tokens so it
 * tracks light/dark automatically — no MUI dependency.
 *
 * variant: 'primary' (brand gradient, default) | 'secondary' (bordered) |
 *          'ghost' (text-only) | 'danger' (destructive actions)
 * Legacy MUI-style values are mapped for backward compatibility:
 *   'contained' -> 'primary', 'outlined' -> 'secondary', 'text' -> 'ghost'
 */
const LEGACY_VARIANT_MAP: Record<string, string> = {
  contained: 'primary',
  outlined: 'secondary',
  text: 'ghost',
};

const SIZE_CLASSES: Record<string, string> = {
  small: 'h-7 px-2.5 text-[11px] gap-1.5',
  medium: 'h-8 px-3 text-xs gap-1.5',
  large: 'h-9 px-4 text-[13px] gap-2',
};

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'contained' | 'outlined' | 'text';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
  /**
   * Legacy MUI `sx` prop. Accepted for backward compatibility with call sites
   * that still pass it; this button renders a plain <button> and ignores it.
   */
  sx?: Record<string, unknown>;
}

export default function Button({
  variant = 'primary',
  size = 'medium',
  className = '',
  disabled = false,
  fullWidth = false,
  loading = false,
  id,
  type = 'button',
  children,
  sx: _sx,
  ...props
}: ButtonProps) {
  const resolvedVariant = LEGACY_VARIANT_MAP[variant] || variant;

  const base =
    'inline-flex items-center justify-center rounded-md font-medium font-sans tracking-wide transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/60 disabled:cursor-not-allowed disabled:opacity-50';

  const variantClasses: Record<string, string> = {
    primary: 'brand-gradient-bg on-gradient hover:brightness-110 shadow-none',
    secondary: 'bg-surface-2 border border-line text-ink-0 hover:bg-surface-3',
    ghost: 'bg-transparent text-ink-1 hover:bg-surface-2 hover:text-ink-0',
    danger: 'bg-danger text-white hover:brightness-110',
  };

  return (
    <button
      id={id}
      type={type}
      disabled={disabled || loading}
      className={`${base} ${SIZE_CLASSES[size] || SIZE_CLASSES.medium} ${
        variantClasses[resolvedVariant] || variantClasses.primary
      } ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
