import React from 'react';
import { FaCamera } from './iconData';

const CameraIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaCamera className={className} />
    </React.Fragment>
  );
};
export default CameraIcon;
