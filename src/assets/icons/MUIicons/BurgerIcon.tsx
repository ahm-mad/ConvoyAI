// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Menu as MenuIcon } from '@components/ui/icons';
import React from 'react';

export default function BurgerIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <MenuIcon fontSize={size} className={className} sx={sx} {...props} />;
}
