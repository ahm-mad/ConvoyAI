// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Battery90Outlined as Battery90OutlinedIcon } from '@components/ui/icons';
import React from 'react';

export default function MuiBatteryIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <Battery90OutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
