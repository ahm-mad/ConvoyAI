// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { TurnedInNot as TurnedInNotIcon } from '@components/ui/icons';
import React from 'react';

export default function BookMarkIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <TurnedInNotIcon fontSize={size} className={className} sx={sx} {...props} />;
}
