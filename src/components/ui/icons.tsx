import type { ComponentType, CSSProperties } from 'react';
import * as L from 'lucide-react';

/**
 * Icon set that replaces @mui/icons-material. Each export keeps the MUI icon's name, so call sites only change
 * their import line, and it accepts the MUI-style props still used in the codebase (fontSize, sx colour/size).
 * All glyphs are lucide-react, the single icon family of the design system.
 */
type MuiFontSize = 'inherit' | 'small' | 'medium' | 'large';

interface Props extends Omit<L.LucideProps, 'ref'> {
  fontSize?: MuiFontSize;
  /** Only `color` and `fontSize` from MUI's sx are honoured; everything else is ignored. */
  sx?: Record<string, unknown>;
  style?: CSSProperties;
}

const SIZE: Record<MuiFontSize, number | string> = {
  inherit: '1em',
  small: 18,
  medium: 22,
  large: 30,
};

function wrap(Icon: ComponentType<L.LucideProps>) {
  return function MuiCompatIcon({ fontSize = 'medium', sx, size, style, ...rest }: Props) {
    const color = typeof sx?.color === 'string' ? sx.color : undefined;
    const sxSize =
      typeof sx?.fontSize === 'number' || typeof sx?.fontSize === 'string'
        ? sx.fontSize
        : undefined;

    return (
      <Icon
        size={size ?? (sxSize as number | string | undefined) ?? SIZE[fontSize]}
        style={{ ...(color ? { color } : {}), ...style }}
        {...rest}
      />
    );
  };
}

export const Close = wrap(L.X);
export const IntegrationInstructions = wrap(L.Code2);
export const Edit = wrap(L.Pencil);
export const EditNote = wrap(L.PenLine);
export const Delete = wrap(L.Trash2);
export const DeleteOutline = wrap(L.Trash2);
export const DeleteOutlineSharp = wrap(L.Trash2);
export const Tune = wrap(L.SlidersHorizontal);
export const SignalWifiOff = wrap(L.WifiOff);
export const Devices = wrap(L.Cpu);
export const Check = wrap(L.Check);
export const Map = wrap(L.Map);
export const LockOutlined = wrap(L.Lock);
export const LockOpen = wrap(L.LockOpen);
export const HighlightOff = wrap(L.XCircle);
export const FilterList = wrap(L.Filter);
export const ExpandMore = wrap(L.ChevronDown);
export const KeyboardArrowDown = wrap(L.ChevronDown);
export const ChevronRight = wrap(L.ChevronRight);
export const ChevronLeft = wrap(L.ChevronLeft);
export const CheckCircleOutline = wrap(L.CheckCircle2);
export const Business = wrap(L.Building2);
export const Analytics = wrap(L.BarChart3);
export const Add = wrap(L.Plus);
export const ControlPoint = wrap(L.PlusCircle);
export const Warning = wrap(L.AlertTriangle);
export const Error = wrap(L.AlertOctagon);
export const TurnedInNot = wrap(L.Bookmark);
export const SignalCellularAlt = wrap(L.SignalHigh);
export const ShareOutlined = wrap(L.Share2);
export const SettingsOutlined = wrap(L.Settings);
export const Send = wrap(L.Send);
export const Search = wrap(L.Search);
export const PushPin = wrap(L.Pin);
export const PrecisionManufacturing = wrap(L.Wrench);
export const Power = wrap(L.Plug);
export const Person = wrap(L.User);
export const OnlinePrediction = wrap(L.Radio);
export const NotificationsActive = wrap(L.Bell);
export const Menu = wrap(L.Menu);
export const ListAlt = wrap(L.List);
export const Layers = wrap(L.Layers);
export const History = wrap(L.History);
export const HelpOutline = wrap(L.HelpCircle);
export const Fingerprint = wrap(L.Fingerprint);
export const Factory = wrap(L.Factory);
export const DragIndicator = wrap(L.GripVertical);
export const DirectionsBoat = wrap(L.Ship);
export const Dashboard = wrap(L.LayoutDashboard);
export const ContactEmergency = wrap(L.IdCard);
