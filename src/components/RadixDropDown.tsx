import React from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

const GlobalSelect = ({
  id,
  value,
  onValueChange,
  placeholder = 'Select...',
  options = [],
  disabled = false,
  className = '',
  triggerClassName = '',
  contentClassName = '',
  size = 'medium', // 'small', 'medium', 'large'
  width = 'auto', // 'auto', 'full', or specific width like 'w-32'
  ...props
}) => {
  // Size configurations
  const sizeClasses = {
    small: 'h-7 px-2 text-xs',
    medium: 'h-8 px-3 text-sm',
    large: 'h-10 px-4 text-base',
  };

  // Width configurations
  const widthClasses = {
    auto: 'w-auto min-w-[80px]',
    full: 'w-full',
    fit: 'w-fit',
  };

  const getWidthClass = () => {
    if (width === 'auto' || width === 'full' || width === 'fit') {
      return widthClasses[width];
    }
    return width; // Custom width class like 'w-32'
  };

  return (
    <div className={className}>
      <Select.Root value={value} onValueChange={onValueChange} disabled={disabled} {...props}>
        <Select.Trigger
          id={id}
          className={`
            inline-flex items-center justify-between 
            ${getWidthClass()} 
            ${sizeClasses[size]}
            bg-surface-2 border border-line rounded-md text-ink-0
            hover:bg-surface-3 focus:outline-none 
            
            disabled:bg-surface-1 disabled:text-ink-2 disabled:cursor-not-allowed disabled:opacity-60
            transition-colors
            ${triggerClassName}
          `}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown className={`${size === 'small' ? 'w-3 h-3' : 'w-4 h-4'} text-ink-2`} />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className={`
              bg-surface-2 border border-line rounded-md shadow-lg z-50 
              min-w-[var(--radix-select-trigger-width)]
              ${contentClassName}
            `}
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport className="p-1 max-h-60 overflow-auto">
              {options.map(option => (
                <Select.Item
                  id={option.id}
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={`
                    relative flex items-center justify-between 
                    px-3 py-2 rounded cursor-pointer text-ink-1
                    hover:bg-surface-3 hover:text-ink-0 focus:bg-surface-3 focus:outline-none 
                    data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink-0
                    data-[state=checked]:bg-accent-cyan/10 data-[state=checked]:text-accent-cyan
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm'}
                  `}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="ml-2">
                    <Check
                      className={`${size === 'small' ? 'w-3 h-3' : 'w-4 h-4'} text-accent-cyan`}
                    />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
};

export default GlobalSelect;
