// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import Battery90OutlinedIcon from '@mui/icons-material/Battery90Outlined';

export default function MuiBatteryIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <Battery90OutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
