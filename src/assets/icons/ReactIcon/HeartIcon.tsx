import React from 'react';
import { FaHeart } from './iconData';

const HeartIcon = ({ classNmae = 'h-10 w-10' }) => {
  return (
    <>
      <FaHeart className={classNmae} />
    </>
  );
};
export default HeartIcon;
