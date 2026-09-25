import React from 'react';
import { FaBatteryHalf } from './iconData';

const BatteryIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaBatteryHalf className={className} />
    </React.Fragment>
  );
};
export default BatteryIcon;
