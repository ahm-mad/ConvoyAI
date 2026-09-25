import React from 'react';
import { MdOutlineEmojiEmotions } from './iconData';

const EmojiIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <>
      <MdOutlineEmojiEmotions className={className} />
    </>
  );
};
export default EmojiIcon;
