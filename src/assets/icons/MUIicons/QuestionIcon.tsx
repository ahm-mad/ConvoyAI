// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

export default function QuestionIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <HelpOutlineIcon fontSize={size} className={className} sx={sx} {...props} />;
}
