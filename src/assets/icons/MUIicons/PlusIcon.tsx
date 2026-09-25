// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import ControlPointIcon from '@mui/icons-material/ControlPoint';

export default function PlusIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ControlPointIcon fontSize={size} className={className} sx={sx} {...props} />;
}
