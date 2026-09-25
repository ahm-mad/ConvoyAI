// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';

const GlobalRadioGroup = ({
  options = [],
  name,
  value,
  onChange,
  className = '',
  labelClass = '',
  radioClass = '',
}: {
  options?: any[];
  name?: any;
  value?: any;
  onChange?: any;
  checked?: any;
  className?: string;
  labelClass?: string;
  radioClass?: string;
}) => {
  return (
    <div role="radiogroup" className={`flex flex-col gap-2 ${className}`}>
      {options.map(option => (
        <label
          key={option.value}
          className={`inline-flex cursor-pointer items-center gap-2 text-body transition-colors ${value === option.value ? 'text-brand' : 'text-ink-1'} ${labelClass}`}
        >
          <input
            type="radio"
            className={`radio ${radioClass}`}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={onChange}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
};

export default GlobalRadioGroup;
