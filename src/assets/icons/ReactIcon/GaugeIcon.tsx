import React from 'react';
import { PiGaugeLight } from './iconData';

const GaugeIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <PiGaugeLight className={className} />
    </>
  );
};
export default GaugeIcon;
