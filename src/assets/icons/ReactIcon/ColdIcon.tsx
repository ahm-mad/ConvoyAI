import React from 'react';
import { LiaSnowflake } from './iconData';

const ColdIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <LiaSnowflake className={className} />
    </React.Fragment>
  );
};
export default ColdIcon;
