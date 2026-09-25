// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

export default function AvatarIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AccountCircleIcon fontSize={size} className={className} sx={sx} {...props} />;
}
