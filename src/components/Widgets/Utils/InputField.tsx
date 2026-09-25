import React from 'react';

const InputField = ({ placeholder, onChange, value, className, type }) => {
  return (
    <div>
      <input
        className={` ${className}`}
        placeholder={placeholder}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        required
      />
    </div>
  );
};

export default InputField;
