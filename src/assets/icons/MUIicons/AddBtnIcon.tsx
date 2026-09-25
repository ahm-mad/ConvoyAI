// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Add as AddIcon } from '@components/ui/icons';
import React from 'react';

export default function AddBtnIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AddIcon fontSize={size} className={className} sx={sx} {...props} />;
}
