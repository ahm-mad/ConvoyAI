// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { SignalCellularAlt as SignalCellularAltIcon } from '@components/ui/icons';
import React from 'react';

export default function SignalIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <SignalCellularAltIcon fontSize={size} className={className} sx={sx} {...props} />;
}
