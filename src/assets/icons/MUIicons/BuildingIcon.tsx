// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Business as BusinessIcon } from '@components/ui/icons';
import React from 'react';

export default function BuildingIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <BusinessIcon fontSize={size} className={className} sx={sx} {...props} />;
}
