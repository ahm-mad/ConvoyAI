import React from 'react';
import { FaCheckCircle } from './iconData';

const CheckIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaCheckCircle className={className} />
    </React.Fragment>
  );
};
export default CheckIcon;
