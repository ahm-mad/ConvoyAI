import React from 'react';
import { GoContainer } from './iconData';

const ContainerIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <GoContainer className={className} />
    </React.Fragment>
  );
};
export default ContainerIcon;
