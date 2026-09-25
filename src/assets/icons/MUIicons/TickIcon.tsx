// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { CheckCircle as CheckCircleIcon } from '@components/ui/icons';
import React from 'react';

export default function TickIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <CheckCircleIcon fontSize={size} className={className} sx={sx} {...props} />;
}
