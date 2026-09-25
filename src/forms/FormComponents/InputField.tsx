import React from 'react';
import TextField from '@mui/material/TextField';

const InputField = ({ placeholder, onChange, value, className, type }) => {
  return (
    <TextField
      className={className} // Allows Tailwind styling if needed
      label={placeholder} // MUI automatically places the label inside the input
      variant="outlined" // You can change this to "filled" or "standard"
      type={type || 'text'} // Default to text input
      value={value}
      onChange={onChange}
      fullWidth // Makes the input take full width
    />
  );
};

export default InputField;
