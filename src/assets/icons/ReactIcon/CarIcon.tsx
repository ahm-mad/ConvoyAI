import React from 'react';
import { IoMdCar } from './iconData';

const CarIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <IoMdCar className={className} />
    </React.Fragment>
  );
};
export default CarIcon;
