import React from 'react';
import { SiIbeacon } from './iconData';

const BeaconIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <SiIbeacon className={className} />
    </React.Fragment>
  );
};
export default BeaconIcon;
