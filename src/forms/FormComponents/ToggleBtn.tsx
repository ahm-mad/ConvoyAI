import { styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';

// Note: trackColor/thumbColor/checkedThumbColor props some callers pass in
// are not read here (MUI's Switch doesn't recognize them) — this component
// only respects checked/onChange/disabled. Colors are fixed below, tied to
// the app's design tokens so it matches every other toggle in the app.
const MinimalSwitch = styled(Switch)(({ theme }) => ({
  padding: 0,
  width: 42,
  height: 25,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '200ms',
    '&.Mui-checked': {
      transform: 'translateX(17px)',
      color: '#eef1f4',
      '& + .MuiSwitch-track': {
        backgroundColor: 'var(--color-accent-cyan)',
        opacity: 1,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 21,
    height: 21,
    borderRadius: '50%',
    backgroundColor: '#eef1f4',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  '& .MuiSwitch-track': {
    borderRadius: 25,
    backgroundColor: 'var(--color-surface-3)',
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 200,
    }),
  },
}));

export default function GlobalToggle({ checked, onChange, disabled, ...props }) {
  return <MinimalSwitch checked={checked} onChange={onChange} disabled={disabled} {...props} />;
}
