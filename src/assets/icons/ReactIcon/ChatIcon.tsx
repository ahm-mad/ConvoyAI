import React from 'react';
import { BsChat } from './iconData';

const ChatIcon = ({ className = 'h-10 w-10' }) => {
  return (
    <React.Fragment>
      <BsChat className={className} />
    </React.Fragment>
  );
};
export default ChatIcon;
