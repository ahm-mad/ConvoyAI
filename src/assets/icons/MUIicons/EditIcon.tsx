// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import EditNoteIcon from '@mui/icons-material/EditNote';

export default function EditIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <EditNoteIcon fontSize={size} className={className} sx={sx} {...props} />;
}
