import React from 'react';
import { FaBed } from './iconData';

const BedIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaBed className={className} />
    </React.Fragment>
  );
};
export default BedIcon;
