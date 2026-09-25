import React from 'react';
import { PiDotsThreeVerticalBold } from './iconData';

const ThreeDotIcon = ({ className = 'h-10 w-10', onClick, ...props }) => {
  return (
    <>
      <PiDotsThreeVerticalBold className={className} onClick={onClick} {...props} />
    </>
  );
};
export default ThreeDotIcon;
