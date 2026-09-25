// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { EditNote as EditNoteIcon } from '@components/ui/icons';
import React from 'react';

export default function EditIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <EditNoteIcon fontSize={size} className={className} sx={sx} {...props} />;
}
