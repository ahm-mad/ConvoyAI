import React from 'react';
import { GiLeak } from './iconData';

const LeakIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <GiLeak className={className} />
    </>
  );
};
export default LeakIcon;
