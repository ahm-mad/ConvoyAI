import React from 'react';
import { MdCallEnd } from './iconData';

const CallEndIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <MdCallEnd className={className} />
    </React.Fragment>
  );
};
export default CallEndIcon;
