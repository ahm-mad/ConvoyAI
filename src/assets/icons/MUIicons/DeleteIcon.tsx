// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { DeleteOutlineSharp as DeleteOutlineSharpIcon } from '@components/ui/icons';
import React from 'react';

export default function DeleteIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <DeleteOutlineSharpIcon fontSize={size} className={className} sx={sx} {...props} />;
}
