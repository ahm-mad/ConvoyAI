// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import BusinessIcon from '@mui/icons-material/Business';

export default function BuildingIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <BusinessIcon fontSize={size} className={className} sx={sx} {...props} />;
}
