import React from 'react';
import { BsBuildings } from './iconData';

const BuildingIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <BsBuildings className={className} />
    </React.Fragment>
  );
};
export default BuildingIcon;
