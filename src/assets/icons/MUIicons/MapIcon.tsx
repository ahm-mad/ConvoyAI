// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Map as MapIcon } from '@components/ui/icons';
import React from 'react';

export default function MapIconWrapper({ size = 'medium', className = '', sx = {}, ...props }) {
  return <MapIcon fontSize={size} className={className} sx={sx} {...props} />;
}
