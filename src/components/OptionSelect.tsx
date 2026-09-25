/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';
import { useOptions, type OptionKind } from '@hooks/useOptions';

/**
 * A <select> fed by the options endpoint (flows/06 §12). One request, active records only. When the
 * company has more matches than the endpoint returns (`meta.truncated`, > 1000), a search box appears
 * so the operator can narrow the list server-side instead of scrolling a giant dropdown.
 *
 * The currently selected value always stays visible even if a later search no longer returns it.
 */
export default function OptionSelect({
  kind,
  value,
  onChange,
  params,
  getOption,
  itemFilter,
  placeholder,
  emptyLabel,
  disabled,
  className = 'w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-xs text-ink-0',
  wrapperClassName = 'flex-1 min-w-0',
  ariaLabel,
  selectedLabel,
}: {
  kind: OptionKind;
  value: string;
  onChange: (value: string, item?: any) => void;
  params?: Record<string, unknown>;
  /** Label (and optional disabled state) for one option. */
  getOption: (item: any) => { label: string; disabled?: boolean };
  /** Drop options client-side (e.g. vehicles already parked in this yard). */
  itemFilter?: (item: any) => boolean;
  placeholder: string;
  /** Shown as the empty option when nothing is available. */
  emptyLabel: string;
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
  ariaLabel?: string;
  /** Label for the current value when it is not among the options (e.g. a deactivated yard on an old trip stop). */
  selectedLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const { items, truncated, isLoading, error } = useOptions(kind, params, { search });
  const known = useRef<Record<string, any>>({});

  const visible = itemFilter ? items.filter(itemFilter) : items;

  visible.forEach(i => {
    known.current[String(i.id)] = i;
  });

  // Keep the chosen option in the list even when the current search no longer returns it.
  const selectedMissing = value && !visible.some(i => String(i.id) === String(value));
  const selectedItem = selectedMissing ? known.current[String(value)] : undefined;
  const fallbackOption = selectedMissing && !selectedItem && selectedLabel;

  const showSearch = truncated || search !== '';

  return (
    <div className={wrapperClassName}>
      {showSearch && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="More than 1,000 match — type to search…"
          aria-label="Search options"
          className="w-full mb-1 bg-surface-2 border border-line rounded-md px-2.5 py-1 text-[11px] text-ink-0"
        />
      )}
      <select
        value={value}
        onChange={e => {
          const item = visible.find(i => String(i.id) === e.target.value) ?? selectedItem;

          onChange(e.target.value, item);
        }}
        disabled={disabled || isLoading}
        aria-label={ariaLabel}
        className={className}
      >
        <option value="">
          {isLoading
            ? 'Loading…'
            : error
              ? 'Could not load options'
              : visible.length
                ? placeholder
                : emptyLabel}
        </option>
        {selectedItem && <option value={selectedItem.id}>{getOption(selectedItem).label}</option>}
        {fallbackOption && <option value={value}>{selectedLabel}</option>}
        {visible.map(i => {
          const o = getOption(i);

          return (
            <option key={i.id} value={i.id} disabled={o.disabled}>
              {o.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
