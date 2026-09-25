import React from 'react';
import { GoClock } from './iconData';

const ClockIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <GoClock className={className} />
    </React.Fragment>
  );
};
export default ClockIcon;
