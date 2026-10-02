'use client';

import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DatePickerProps {
  /** ISO 'YYYY-MM-DD', same contract as a native `<input type="date">`. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 'field' (default) = form-field look; 'control' = compact pill look for toolbars. */
  variant?: 'field' | 'control';
  /** Defaults to true (fills its container, matching a native date input in a form grid). */
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  'aria-label'?: string;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseISO(s?: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Token-styled replacement for `<input type="date">` (which otherwise pops the OS-native
 * calendar — jarring next to the rest of the glassy, orange design language). Same ISO
 * string value/onChange contract as the native input, so call sites swap in directly.
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  variant = 'field',
  fullWidth = true,
  className = '',
  disabled,
  min,
  max,
  id,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const selected = parseISO(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());

  useEffect(() => {
    if (open) setViewMonth(selected ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minD = parseISO(min);
  const maxD = parseISO(max);
  const today = new Date();

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          className={`${variant === 'control' ? 'control' : 'field'} inline-flex items-center justify-between gap-2 ${fullWidth ? 'w-full' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}
        >
          <span className={`flex items-center gap-1.5 truncate ${selected ? '' : 'text-ink-2'}`}>
            <CalendarIcon size={14} className="shrink-0 text-ink-2" />
            {selected
              ? selected.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : placeholder}
          </span>
          {selected && !disabled && (
            <X
              size={13}
              className="shrink-0 text-ink-2 hover:text-ink-0"
              onClick={e => {
                e.stopPropagation();
                onChange('');
              }}
            />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="glass-strong z-[9999] w-[260px] rounded-2xl p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="btn-soft grid size-7 place-items-center !px-0"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-caption font-semibold text-ink-0">
              {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="btn-soft grid size-7 place-items-center !px-0"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="grid h-6 place-items-center text-[10px] font-semibold text-ink-2"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isSelected = !!selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              const isDisabled = (!!minD && d < minD) || (!!maxD && d > maxD);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(toISO(d));
                    setOpen(false);
                  }}
                  className={`grid size-8 place-items-center rounded-full text-[12.5px] transition-colors ${
                    isSelected
                      ? 'btn-brand !text-white'
                      : isToday
                        ? 'font-semibold text-brand-text'
                        : 'text-ink-1 hover:bg-brand-wash'
                  } ${isDisabled ? 'cursor-not-allowed opacity-30 hover:bg-transparent' : ''}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-2 w-full text-center text-caption text-brand-text hover:underline"
            onClick={() => {
              onChange(toISO(today));
              setOpen(false);
            }}
          >
            Today
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
