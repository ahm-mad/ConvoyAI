// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { LuCircleChevronUp } from './iconData';

export default function CircleChevronUp({ size = 'medium', onChange, className = '' }) {
  return (
    <React.Fragment>
      <LuCircleChevronUp fontSize={size} className={className} onChange={onchange} />
    </React.Fragment>
  );
}
