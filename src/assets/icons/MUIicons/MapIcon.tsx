// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import MapIcon from '@mui/icons-material/Map';

export default function MapIconWrapper({ size = 'medium', className = '', sx = {}, ...props }) {
  return <MapIcon fontSize={size} className={className} sx={sx} {...props} />;
}
