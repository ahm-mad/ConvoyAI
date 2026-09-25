// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { PushPin as PushPinIcon } from '@components/ui/icons';
import React from 'react';

export default function PinIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <PushPinIcon fontSize={size} className={className} sx={sx} {...props} />;
}
