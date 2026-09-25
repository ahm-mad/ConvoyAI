import React from 'react';

const CheckBox = ({ label, checked, onChange }) => {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
      <input type="checkbox" className="check" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
};

export default CheckBox;
