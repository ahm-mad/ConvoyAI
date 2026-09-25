// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { OnlinePrediction as OnlinePredictionIcon } from '@components/ui/icons';
import React from 'react';

export default function OnlineSignalIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <OnlinePredictionIcon fontSize={size} className={className} sx={sx} {...props} />;
}
