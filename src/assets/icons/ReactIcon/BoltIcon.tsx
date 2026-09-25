import React from 'react';
import { MdBolt } from './iconData';

const BoltIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <MdBolt className={className} />
    </React.Fragment>
  );
};
export default BoltIcon;
