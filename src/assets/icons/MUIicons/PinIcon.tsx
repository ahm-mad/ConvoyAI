// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import PushPinIcon from '@mui/icons-material/PushPin';

export default function PinIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <PushPinIcon fontSize={size} className={className} sx={sx} {...props} />;
}
