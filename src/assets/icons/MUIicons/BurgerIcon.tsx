// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import MenuIcon from '@mui/icons-material/Menu';

export default function BurgerIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <MenuIcon fontSize={size} className={className} sx={sx} {...props} />;
}
