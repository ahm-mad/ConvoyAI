import React from 'react';
import { TbCircleChevronDown } from './iconData';

function CircleChevronDown({ className, onClick }) {
  return (
    <React.Fragment>
      <TbCircleChevronDown onClick={onClick} className={className} />
    </React.Fragment>
  );
}

export default CircleChevronDown;
