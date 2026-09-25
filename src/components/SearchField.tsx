import { Search as SearchIcon } from 'lucide-react';
import React from 'react';

/** Search input with a leading icon (replaces the MUI TextField version). `label` is the placeholder. */
const SearchField = ({ value, onChange, label = 'Search...', className = '', ...props }) => {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon
        size={15}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2"
      />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={label}
        aria-label={label}
        className="control w-full pl-9"
        {...props}
      />
    </div>
  );
};

export default SearchField;
