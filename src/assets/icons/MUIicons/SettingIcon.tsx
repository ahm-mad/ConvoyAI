// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { SettingsOutlined as SettingsOutlinedIcon } from '@components/ui/icons';
import React from 'react';

export default function SettingIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return (
    <>
      <SettingsOutlinedIcon fontSize={size} className={className} sx={sx} {...props} />
    </>
  );
}
