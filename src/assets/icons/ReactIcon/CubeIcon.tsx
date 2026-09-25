import React from 'react';
import { PiCubeThin } from './iconData';

const CubeIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <PiCubeThin className={className} />
    </React.Fragment>
  );
};
export default CubeIcon;
