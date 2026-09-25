// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import CloseIcon from '@mui/icons-material/Close';

export default function CrossIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <CloseIcon fontSize={size} className={className} sx={sx} {...props} />;
}
