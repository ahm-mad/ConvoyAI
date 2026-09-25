import React from 'react';
import { FaBell } from './iconData';

const BellIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaBell className={className} />
    </React.Fragment>
  );
};
export default BellIcon;
