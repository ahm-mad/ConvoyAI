// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';

export default function IntegrationIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <IntegrationInstructionsIcon fontSize={size} className={className} sx={sx} {...props} />;
}
