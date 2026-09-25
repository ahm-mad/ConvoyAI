import React from 'react';
import { PiFanFill } from './iconData';

const FanIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <PiFanFill className={className} />
    </>
  );
};
export default FanIcon;
