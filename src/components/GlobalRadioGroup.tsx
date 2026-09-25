// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import PropTypes from 'prop-types';
import { styled } from '@mui/material/styles';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';

const StyledFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  '& .MuiFormControlLabel-label': {
    transition: 'color 0.3s ease',
  },
  '&.checked .MuiFormControlLabel-label': {
    color: theme.palette.primary.main,
  },
}));

const GlobalRadioGroup = ({
  options = [],
  name,
  value,
  onChange,
  checked = undefined,
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
    <RadioGroup
      name={name}
      value={value}
      checked={checked}
      onChange={onChange}
      className={className}
    >
      {options.map(option => (
        <StyledFormControlLabel
          key={option.value}
          value={option.value}
          label={option.label}
          control={<Radio className={radioClass} />}
          className={value === option.value ? 'checked' : ''}
          classes={{ label: labelClass }}
        />
      ))}
    </RadioGroup>
  );
};

GlobalRadioGroup.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  name: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  labelClass: PropTypes.string,
  radioClass: PropTypes.string,
};

export default GlobalRadioGroup;
