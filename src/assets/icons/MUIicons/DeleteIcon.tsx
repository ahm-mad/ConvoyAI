// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import DeleteOutlineSharpIcon from '@mui/icons-material/DeleteOutlineSharp';

export default function DeleteIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <DeleteOutlineSharpIcon fontSize={size} className={className} sx={sx} {...props} />;
}
