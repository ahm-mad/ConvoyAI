// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ShareOutlined as ShareOutlinedIcon } from '@components/ui/icons';
import React from 'react';

export default function ShareIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ShareOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
