import React from 'react';
import { TbCircleChevronUp } from './iconData';

function CircleChevronUp({ className, onClick }) {
  return (
    <React.Fragment>
      <TbCircleChevronUp onClick={onClick} className={className} />
    </React.Fragment>
  );
}

export default CircleChevronUp;
