// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import FilterListIcon from '@mui/icons-material/FilterList';

export default function FilterIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <FilterListIcon fontSize={size} className={className} sx={sx} {...props} />;
}
