// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import AddIcon from '@mui/icons-material/Add';

export default function AddBtnIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AddIcon fontSize={size} className={className} sx={sx} {...props} />;
}
