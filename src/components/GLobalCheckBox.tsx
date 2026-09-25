// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

export default function GlobalCheckbox({
  defaultChecked = false,
  onChange,
  label = '',
  size = 'medium',
  color = 'primary',
  disabled = false,
  className = '',
  checked = undefined,
  ...props
}) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          onChange={onChange}
          size={size}
          color={color}
          disabled={disabled}
          className={className}
          inputProps={{ 'aria-label': 'global checkbox' }}
          checked={checked}
          {...props}
        />
      }
      label={label}
    />
  );
}
