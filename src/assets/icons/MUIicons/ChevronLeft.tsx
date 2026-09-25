// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ChevronLeft as ChevronLeftIcon } from '@components/ui/icons';
import React from 'react';

export default function ChevronLeft({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ChevronLeftIcon fontSize={size} className={className} sx={sx} {...props} />;
}
