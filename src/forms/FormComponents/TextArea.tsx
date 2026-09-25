import React from 'react';

const TextArea = ({
  id = 'textarea',
  rows = 4,
  value = '',
  onChange = () => {},
  placeholder = 'Enter text...',
  className = '',
  disabled = false,
  ...props
}) => {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`block p-3 w-full text-sm text-text-dark bg-background/40 rounded-lg border border-background focus:border-primary focus:outline-none transition-all duration-200 ease-in-out placeholder:text-ink-2 ${className}`}
      {...props}
    />
  );
};

export default TextArea;
