import React from 'react';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

const CheckBox = ({ label, checked, onChange }) => {
  return (
    <FormGroup>
      <FormControlLabel
        control={
          <Checkbox
            checked={checked}
            onChange={onChange}
            sx={{
              color: 'var(--color-line)',
              '&.Mui-checked': { color: 'var(--color-accent-cyan)' },
            }}
          />
        }
        label={<span className="text-sm text-ink-1">{label}</span>}
      />
    </FormGroup>
  );
};

export default CheckBox;
