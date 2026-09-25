import { Search as SearchIcon } from '@components/ui/icons';
import React from 'react';
import { TextField, InputAdornment } from '@mui/material';

const SearchField = ({ value, onChange, label = 'Search...', className = '', ...props }) => {
  return (
    <TextField
      // fullWidth
      variant="outlined"
      size="small"
      value={value}
      onChange={onChange}
      label={label}
      className={className}
      sx={{
        '& .MuiOutlinedInput-root': {
          color: 'var(--color-ink-0)',
          backgroundColor: 'var(--color-surface-2)',
          '& fieldset': { borderColor: 'var(--color-line)' },
          '&:hover fieldset': { borderColor: 'var(--color-line)' },
          '&.Mui-focused fieldset': { borderColor: 'var(--color-accent-cyan)' },
        },
        '& .MuiInputLabel-root': { color: 'var(--color-ink-2)' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--color-accent-cyan)' },
      }}
      InputProps={{
        sx: { height: '40px' }, // Matches dropdown height
        endAdornment: (
          <InputAdornment position="end">
            <SearchIcon sx={{ fontSize: 20, color: 'var(--color-ink-2)' }} />
          </InputAdornment>
        ),
      }}
      {...props}
    />
  );
};

export default SearchField;
