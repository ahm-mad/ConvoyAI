// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

export default function SettingIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return (
    <>
      <SettingsOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />
    </>
  );
}
