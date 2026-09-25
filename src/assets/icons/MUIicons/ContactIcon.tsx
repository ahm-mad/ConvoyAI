// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';

export default function ContactIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <ContactEmergencyIcon fontSize={size} className={className} sx={sx} {...props} />;
}
