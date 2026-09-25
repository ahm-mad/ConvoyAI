import React from 'react';
import { LuBlocks } from './iconData';

const AppIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <LuBlocks className={className} />
    </>
  );
};
export default AppIcon;
