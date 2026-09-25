// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import PowerIcon from '@mui/icons-material/Power';

export default function PowerSwitch({ size = 'medium', className = '', sx = {}, ...props }) {
  return <PowerIcon fontSize={size} className={className} sx={sx} {...props} />;
}
