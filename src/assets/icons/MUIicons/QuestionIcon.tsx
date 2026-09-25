// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { HelpOutline as HelpOutlineIcon } from '@components/ui/icons';
import React from 'react';

export default function QuestionIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <HelpOutlineIcon fontSize={size} className={className} sx={sx} {...props} />;
}
