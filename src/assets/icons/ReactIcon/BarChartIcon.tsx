import React from 'react';
import { BsBarChartFill } from './iconData';

const BarChartIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <BsBarChartFill className={className} />
    </React.Fragment>
  );
};
export default BarChartIcon;
