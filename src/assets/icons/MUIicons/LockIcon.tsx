// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { LockOutlined as LockOutlinedIcon } from '@components/ui/icons';
import React from 'react';

export default function LockIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <LockOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />;
}
