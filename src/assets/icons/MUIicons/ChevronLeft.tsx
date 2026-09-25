// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

export default function ChevronLeft({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ChevronLeftIcon fontSize={size} className={className} sx={sx} {...props} />;
}
