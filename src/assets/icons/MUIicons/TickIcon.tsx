// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function TickIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <CheckCircleIcon fontSize={size} className={className} sx={sx} {...props} />;
}
