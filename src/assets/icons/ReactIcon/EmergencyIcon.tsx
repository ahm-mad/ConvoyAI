import Reacrt from 'react';
import { MdOutlineEmergencyShare } from './iconData';

const EmergencyIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <MdOutlineEmergencyShare className={className} />
    </>
  );
};
export default EmergencyIcon;
