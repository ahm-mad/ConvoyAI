// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
// import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenIcon from '@mui/icons-material/LockOpen';

export default function LockIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <LockOpenIcon fontSize={size} className={className} color="primary" sx={sx} {...props} />;
}
