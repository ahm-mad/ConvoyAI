// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { IntegrationInstructions as IntegrationInstructionsIcon } from '@components/ui/icons';
import React from 'react';

export default function IntegrationIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <IntegrationInstructionsIcon fontSize={size} className={className} sx={sx} {...props} />;
}
