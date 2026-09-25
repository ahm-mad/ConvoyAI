// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { CircularProgress } from '@mui/material';

export default function Loader({ size = 18, className = '', sx = {}, ...props }) {
  return <CircularProgress size={18} fontSize={size} className={className} sx={sx} {...props} />;
}
