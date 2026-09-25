import React from 'react';
import { RiBaseStationLine } from './iconData';

const BaseStationIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <RiBaseStationLine className={className} />
    </React.Fragment>
  );
};
export default BaseStationIcon;
