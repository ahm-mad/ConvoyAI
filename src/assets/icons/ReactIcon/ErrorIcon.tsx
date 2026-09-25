import React from 'react';
import { BiSolidError } from './iconData';

const ErrorIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <BiSolidError className={className} />
    </>
  );
};
export default ErrorIcon;
