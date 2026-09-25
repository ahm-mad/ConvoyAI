import React from 'react';
import { PiHouseLineLight } from './iconData';

const HouseIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <PiHouseLineLight className={className} />
    </>
  );
};
export default HouseIcon;
