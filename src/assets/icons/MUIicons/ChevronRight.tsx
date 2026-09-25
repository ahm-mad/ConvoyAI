// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ChevronRight as ChevronRightIcon } from '@components/ui/icons';
import React from 'react';

export default function Chevron({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ChevronRightIcon fontSize={size} className={className} sx={sx} {...props} />;
}
