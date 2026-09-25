// src/components/CustomSelect.jsx
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

const CustomSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  className = '',
  id,
  hideChevron = false,
  OptionClass = ' ',
  maxHeight = '250px',
}) => {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        id={id}
        className={`bg-surface-2 rounded-md px-3 py-2 text-sm text-ink-0 border border-line focus:outline-none focus:border-accent-cyan inline-flex justify-between items-center ${className}`}
      >
        <Select.Value placeholder={placeholder} />
        {!hideChevron && (
          <Select.Icon className="ml-2 text-ink-2">
            <ChevronDown size={16} />
          </Select.Icon>
        )}
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="bg-surface-2 rounded-md shadow-lg border border-line z-50"
          position="popper"
        >
          <Select.Viewport
            className={`p-1 ${OptionClass}`}
            style={{
              maxHeight: maxHeight,
              overflowY: 'auto',
            }}
          >
            {options.map((option, idx) => (
              <Select.Item
                id={`custom-select-item-${idx}`}
                key={idx}
                value={option}
                className="px-4 py-2 text-sm text-ink-1 rounded hover:bg-surface-3 hover:text-ink-0 cursor-pointer focus:outline-none"
              >
                <Select.ItemText>{option}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};

export default CustomSelect;
