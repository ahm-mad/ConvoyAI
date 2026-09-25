import React from 'react';
import { CgProfile } from './iconData';

const ProfileIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <CgProfile className={className} />
    </>
  );
};
export default ProfileIcon;
