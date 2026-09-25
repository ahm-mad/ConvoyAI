// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Dashboard as DashboardIcon } from '@components/ui/icons';
import React from 'react';

export default function DashboardIconWrapper({
  size = 'medium',
  className = '',
  sx = {},
  ...props
}) {
  return <DashboardIcon fontSize={size} className={className} sx={sx} {...props} />;
}
