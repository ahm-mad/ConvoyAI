import React from 'react';
import { IoToggle } from './iconData';

const ToggleIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <IoToggle className={className} />
    </>
  );
};
export default ToggleIcon;
