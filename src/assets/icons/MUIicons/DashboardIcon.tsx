// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';

export default function DashboardIconWrapper({
  size = 'medium',
  className = '',
  sx = {},
  ...props
}) {
  return <DashboardIcon fontSize={size} className={className} sx={sx} {...props} />;
}
