// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { FilterList as FilterListIcon } from '@components/ui/icons';
import React from 'react';

export default function FilterIcon({ size = 'medium', className = '', sx = {}, ...props }) {
  return <FilterListIcon fontSize={size} className={className} sx={sx} {...props} />;
}
