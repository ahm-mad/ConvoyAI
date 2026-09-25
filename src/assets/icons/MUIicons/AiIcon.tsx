// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { AutoAwesomeSharp as AutoAwesomeSharpIcon } from '@components/ui/icons';
import React from 'react';

export default function AiIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <AutoAwesomeSharpIcon fontSize={size} className={className} sx={sx} {...props} />;
}
