import React from 'react';
import { LiaTemperatureHighSolid } from './iconData';

const TemperatureIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <LiaTemperatureHighSolid className={className} />
    </>
  );
};
export default TemperatureIcon;
