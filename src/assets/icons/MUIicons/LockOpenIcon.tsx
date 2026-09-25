// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { LockOpen as LockOpenIcon } from '@components/ui/icons';
import React from 'react';
// import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export default function LockIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <LockOpenIcon fontSize={size} className={className} color="primary" sx={sx} {...props} />;
}
