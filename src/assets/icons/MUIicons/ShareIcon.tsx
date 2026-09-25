// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';

export default function ShareIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ShareOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
