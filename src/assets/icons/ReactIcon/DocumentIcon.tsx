import React from 'react';
import { HiOutlineDocumentText } from './iconData';

const DocumentIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <HiOutlineDocumentText className={className} />
    </>
  );
};
export default DocumentIcon;
