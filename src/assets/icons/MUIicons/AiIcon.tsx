// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import AutoAwesomeSharpIcon from '@mui/icons-material/AutoAwesomeSharp';

export default function AiIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AutoAwesomeSharpIcon fontSize={size} className={className} sx={sx} {...props} />;
}
