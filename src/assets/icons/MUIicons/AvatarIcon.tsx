// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { AccountCircle as AccountCircleIcon } from '@components/ui/icons';
import React from 'react';

export default function AvatarIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AccountCircleIcon fontSize={size} className={className} sx={sx} {...props} />;
}
