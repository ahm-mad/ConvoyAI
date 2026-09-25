// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export default function Chevron({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ChevronRightIcon fontSize={size} className={className} sx={sx} {...props} />;
}
