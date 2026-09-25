import { useEffect, useState } from 'react';
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from 'react';
import * as Label from '@radix-ui/react-label';

export interface GlobalInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'width' | 'height' | 'value' | 'onChange'
> {
  label?: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'xs' | string;
  value?: string | number | null;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: boolean;
  helperText?: ReactNode;
  name?: string;
  type?: string;
  inputProps?: (InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>) | undefined;
  labelProps?: (LabelHTMLAttributes<HTMLLabelElement> & Record<string, unknown>) | undefined;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  required?: boolean;
  fullWidth?: boolean;
  /** Tailwind width class, e.g. `w-40` — takes priority over `fullWidth`. */
  width?: string;
  /** Tailwind height class, e.g. `h-9` — takes priority over the default. */
  height?: string;
  textSize?: string;
  shrink?: boolean;
  className?: string;
  helperTextBg?: CSSProperties['backgroundColor'];
  placeholder?: string;
  disabled?: boolean;
}

const GlobalInput = ({
  label,
  size,
  value,
  onChange,
  error,
  helperText,
  name,
  type = 'text',
  inputProps,
  labelProps,
  startAdornment,
  endAdornment,
  required = false,
  fullWidth = true,
  width, // Custom width prop
  height, // Custom height prop
  textSize = 'text-sm',
  shrink,
  className = '',
  helperTextBg = 'inherit',
  placeholder,
  disabled = false,
  ...props
}: GlobalInputProps) => {
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    function handleScreenSize() {
      setScreenWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleScreenSize);
    return () => {
      window.removeEventListener('resize', handleScreenSize);
    };
  }, []);

  // Handle focus states
  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (inputProps?.onFocus) {
      (inputProps.onFocus as (e: FocusEvent<HTMLInputElement>) => void)(e);
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (inputProps?.onBlur) {
      (inputProps.onBlur as (e: FocusEvent<HTMLInputElement>) => void)(e);
    }
  };

  // Build input classes - simple approach
  let inputClasses = `px-2.5 py-1.5 ${textSize} border rounded-md bg-surface-2 text-ink-0 placeholder:text-ink-2 transition-all duration-150 focus:outline-none`;

  // Handle height - custom height takes priority over default
  if (height) {
    inputClasses += ` ${height}`;
  } else {
    inputClasses += ' h-[34px]';
  }

  // Handle width - custom width takes priority over fullWidth
  if (width) {
    inputClasses += ` ${width}`;
  } else if (fullWidth) {
    inputClasses += ' w-full';
  }

  if (error) {
    inputClasses +=
      ' border-danger focus:border-danger focus:shadow-[0_0_0_2px_rgba(242,73,92,0.2)]';
  } else {
    inputClasses +=
      ' border-line focus:border-accent-cyan focus:shadow-[0_0_0_2px_rgba(34,211,238,0.15)]';
  }

  // Add padding for icons
  if (startAdornment) inputClasses += ' pl-10';
  if (endAdornment) inputClasses += ' pr-10';

  // Add disabled state
  if (disabled) inputClasses += ' bg-surface-1 text-ink-2 cursor-not-allowed';

  // Add custom classes
  if (className) inputClasses += ' ' + className;

  // Build label classes - simple
  let labelClasses = 'block text-sm font-medium mb-1.5';
  if (error) labelClasses += ' text-danger';
  else labelClasses += ' text-ink-1';
  if (required) labelClasses += " after:content-['*'] after:text-danger after:ml-1";

  // Build helper text classes - simple
  let helperTextClasses = 'mt-1.5 text-xs';
  if (error) helperTextClasses += ' text-danger';
  else helperTextClasses += ' text-ink-2';

  // Container classes - handle container width
  let containerClasses = 'relative';
  if (width) {
    containerClasses += ` ${width}`;
  } else if (fullWidth) {
    containerClasses += ' w-full';
  }

  return (
    <div className={containerClasses}>
      {/* Label */}
      {label && (
        <Label.Root htmlFor={name} className={labelClasses} {...labelProps}>
          {label}
        </Label.Root>
      )}

      {/* Input Container */}
      <div className="relative">
        {/* Start Adornment */}
        {startAdornment && (
          <div className="absolute left-3   top-1/2 transform -translate-y-1/2 text-ink-2 pointer-events-none z-10">
            {startAdornment}
          </div>
        )}

        {/* Input Field */}
        <input
          id={name}
          name={name}
          type={type}
          value={value ?? ''}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          {...inputProps}
          {...props}
        />

        {/* End Adornment */}
        {endAdornment && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-ink-2 pointer-events-none z-10">
            {endAdornment}
          </div>
        )}
      </div>

      {/* Helper Text */}
      {helperText && (
        <div className={helperTextClasses} style={{ backgroundColor: helperTextBg }}>
          {helperText}
        </div>
      )}
    </div>
  );
};

export default GlobalInput;
