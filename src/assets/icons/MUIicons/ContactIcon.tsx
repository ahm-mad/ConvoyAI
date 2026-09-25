// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ContactEmergency as ContactEmergencyIcon } from '@components/ui/icons';
import React from 'react';

export default function ContactIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ContactEmergencyIcon fontSize={size} className={className} sx={sx} {...props} />;
}
