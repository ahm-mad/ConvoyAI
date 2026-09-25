import React from 'react';
import { SlCalender } from './iconData';

const CalenderIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <SlCalender className={className} />
    </React.Fragment>
  );
};
export default CalenderIcon;
