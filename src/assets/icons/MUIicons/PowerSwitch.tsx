// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Power as PowerIcon } from '@components/ui/icons';
import React from 'react';

export default function PowerSwitch({ size = 'medium', className = '', sx = {}, ...props }) {
  return <PowerIcon fontSize={size} className={className} sx={sx} {...props} />;
}
