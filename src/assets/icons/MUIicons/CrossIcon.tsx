// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Close as CloseIcon } from '@components/ui/icons';
import React from 'react';

export default function CrossIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <CloseIcon fontSize={size} className={className} sx={sx} {...props} />;
}
