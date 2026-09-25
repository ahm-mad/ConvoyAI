import React from 'react';
import { FaBluetoothB } from './iconData';

const BluetoothIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <FaBluetoothB className={className} />
    </React.Fragment>
  );
};
export default BluetoothIcon;
