import React from 'react';
import { TfiGallery } from './iconData';

const GalleryIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <TfiGallery className={className} />
    </>
  );
};
export default GalleryIcon;
