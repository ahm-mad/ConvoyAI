// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ControlPoint as ControlPointIcon } from '@components/ui/icons';
import React from 'react';

export default function PlusIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ControlPointIcon fontSize={size} className={className} sx={sx} {...props} />;
}
