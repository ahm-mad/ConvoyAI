// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';

export default function GlobalCheckbox({
  defaultChecked = false,
  onChange,
  label = '',
  disabled = false,
  className = '',
  checked = undefined,
  size: _size = undefined,
  color: _color = undefined,
  ...props
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 text-body text-ink-1 ${className}`}
    >
      <input
        type="checkbox"
        className="check"
        onChange={onChange}
        disabled={disabled}
        aria-label="global checkbox"
        {...(checked === undefined ? { defaultChecked } : { checked })}
        {...props}
      />
      {label}
    </label>
  );
}
