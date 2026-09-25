import React from 'react';
import { MdBugReport } from './iconData';

const BugIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <MdBugReport className={className} />
    </React.Fragment>
  );
};
export default BugIcon;
