import React from 'react';
import { PiCode } from './iconData';

const CodeIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <PiCode className={className} />
    </React.Fragment>
  );
};
export default CodeIcon;
