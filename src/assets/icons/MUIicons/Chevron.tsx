// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

export default function Chevron({ size = 'medium', className = '', sx = {}, ...props }) {
  return <KeyboardArrowDownIcon fontSize={size} className={className} sx={sx} {...props} />;
}
