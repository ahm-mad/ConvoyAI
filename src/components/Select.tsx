import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption {
  label?: ReactNode;
  value: string;
  [key: string]: unknown;
}

export interface SelectRadixProps {
  placeholder?: string;
  options?: SelectOption[];
  value?: string | null;
  onValueChange?: (value: string) => void;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large' | 'xs' | string;
  className?: string;
  error?: boolean;
  helperText?: ReactNode;
  disabled?: boolean;
  renderOption?: (option: SelectOption) => ReactNode;
  renderValue?: (value: string) => ReactNode;
  id?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

const SelectRadix = ({
  placeholder = 'Select an option',
  options = [],
  value = '',
  onValueChange,
  fullWidth = true,
  size = 'small',
  className = '',
  error,
  helperText,
  disabled = false,
  renderOption, // 👈 add this
  renderValue, // 👈 add this
  id,
  searchable = false,
  searchPlaceholder = 'Search...',
}: SelectRadixProps) => {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions =
    searchable && search.trim()
      ? options.filter(option =>
          String(option.label ?? '')
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        )
      : options;
  const getSizeClasses = () => {
    if (size === 'small') return 'h-[34px] px-2 text-sm';
    if (size === 'xs') return 'h-[34px] px-2 text-sm';
    if (size === 'large') return 'h-[38px] px-3 text-base';
    return 'px-3 text-sm';
  };

  const getItemSizeClasses = () => {
    if (size === 'small') return 'h-8 text-sm';
    if (size === 'xs') return 'h-[34px] px-2 text-sm';
    if (size === 'large') return 'h-10 text-base';
    return 'h-10 text-sm';
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`${className} ${fullWidth ? 'w-full' : ''}`}>
      <Select.Root
        value={value || ''}
        onValueChange={onValueChange}
        disabled={disabled}
        onOpenChange={isOpen => {
          if (!isOpen) setSearch('');
        }}
      >
        <Select.Trigger
          id={id}
          className={`
            inline-flex items-center justify-between w-full rounded-md border
            ${getSizeClasses()}
            ${disabled ? 'bg-surface-1 text-ink-2 cursor-not-allowed' : 'bg-surface-2 cursor-pointer'}
            ${error ? 'border-danger' : 'border-line'}
            ${value ? 'text-ink-0' : 'text-ink-2'}
            outline-none transition-colors
            data-[state=open]:border-accent-cyan
          `}
        >
          <Select.Value placeholder={placeholder}>
            {renderValue && selectedOption
              ? renderValue(selectedOption.value)
              : selectedOption?.label}
          </Select.Value>
          <Select.Icon>
            <ChevronDown size={16} className="text-ink-2" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="
              overflow-hidden bg-surface-2 rounded-md border border-line shadow-lg
              z-[9999] max-h-[300px] min-w-[var(--radix-select-trigger-width)]
              data-[side=top]:animate-slideDownAndFade
              data-[side=bottom]:animate-slideUpAndFade
            "
            position="popper"
            sideOffset={5}
            // NOTE(ts-migration): Radix Select's Content has no `onOpenAutoFocus`
            // (it's a Dialog/Popover prop) — this handler was already inert before
            // the migration. Kept verbatim via a loose spread to preserve behaviour;
            // the search-input autofocus-on-open is effectively dead. See task.md.
            {...({
              onOpenAutoFocus: (e: Event) => {
                if (searchable) {
                  e.preventDefault();
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }
              },
            } as Record<string, unknown>)}
          >
            {searchable && (
              <div className="sticky top-0 z-10 bg-surface-2 p-1.5 border-b border-line">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Escape') e.stopPropagation();
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full h-8 pl-7 pr-2 text-sm rounded-md bg-surface-1 border border-line outline-none text-ink-0 placeholder:text-ink-2 focus:border-accent-cyan"
                  />
                </div>
              </div>
            )}
            <Select.Viewport className="p-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => (
                  <Select.Item
                    key={option.value || `item-${index}`}
                    value={option.value}
                    id={`unit-${index}`}
                    className={`
                      ${getItemSizeClasses()}
                      text-ink-1 rounded-md flex items-center pl-9 pr-3
                      relative select-none cursor-pointer outline-none
                      hover:bg-surface-3 hover:text-ink-0 focus:bg-surface-3
                      data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink-0
                      transition-colors duration-150
                    `}
                  >
                    <Select.ItemIndicator className="absolute left-2 flex items-center text-accent-cyan">
                      <Check size={14} />
                    </Select.ItemIndicator>
                    <Select.ItemText>
                      {renderOption ? renderOption(option) : option.label}
                    </Select.ItemText>
                  </Select.Item>
                ))
              ) : (
                <Select.Item
                  value="no-options"
                  disabled
                  className="text-sm text-ink-2 py-2 px-3 cursor-not-allowed"
                >
                  <Select.ItemText>
                    {searchable && search.trim() ? 'No matches found' : 'No options available'}
                  </Select.ItemText>
                </Select.Item>
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {helperText && (
        <div className={`text-xs mt-1.5 ml-0.5 ${error ? 'text-danger' : 'text-ink-2'}`}>
          {helperText}
        </div>
      )}
    </div>
  );
};

export default SelectRadix;
