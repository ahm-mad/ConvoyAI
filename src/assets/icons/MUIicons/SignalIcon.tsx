// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';

export default function SignalIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <SignalCellularAltIcon fontSize={size} className={className} sx={sx} {...props} />;
}
