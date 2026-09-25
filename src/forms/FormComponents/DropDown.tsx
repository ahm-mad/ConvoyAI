import React, { useState } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

function DropDown({ label, value, onChange, className, minWidth, options = [] }) {
  return (
    <div>
      <FormControl
        className={`bg-[#fff] rounded-lg ${className}`}
        sx={{ m: 1, minWidth: minWidth || 700 }}
      >
        <InputLabel className="font-bold" id="demo-simple-select-autowidth-label">
          {' '}
          {label}{' '}
        </InputLabel>
        <Select
          labelId="demo-simple-select-autowidth-label"
          id="demo-simple-select-autowidth"
          value={value}
          onChange={onChange}
          autoWidth
          label={label}
        >
          {options && options.length > 0 ? (
            options.map((option, index) => (
              <MenuItem key={index} value={option.value}>
                {option.label}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>No options available</MenuItem>
          )}
        </Select>
      </FormControl>
    </div>
  );
}

export default DropDown;
