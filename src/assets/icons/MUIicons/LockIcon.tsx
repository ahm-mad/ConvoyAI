// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export default function LockIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <LockOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
