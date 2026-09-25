// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
//assets icons
import BuildingIcon from '@mui/icons-material/Business';
import FactoryIcon from '@mui/icons-material/Factory';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import CategoryIcon from '@mui/icons-material/Category'; // Fallback general icon
//widget icons
import waterleak from '@assets/images/waterLeak.webp';
import temperature from '@assets/images/temperature.webp';
import Humidity from '@assets/images/humidity.webp';
import battery from '@assets/images/battery.webp';
import signal from '@assets/images/signal-range.webp';
import tankLevel from '@assets/images/water-tank.webp';
import current from '@assets/images/bolt.webp';
import fingerprint from '@assets/images/fingerprint.webp';
import fireAlarm from '@assets/images/fire-alarm.webp';
import router from '@assets/images/wifi-router.webp';
import smokeDetector from '@assets/images/smoke-detector.webp';
import door from '@assets/images/door.webp';
import gasleak from '@assets/images/gas-leak.webp';
import motion from '@assets/images/motion.webp';

export const IconMapper = {
  BuildingIcon: <BuildingIcon style={{ fontSize: '14px' }} />,
  FactoryIcon: <FactoryIcon style={{ fontSize: '14px' }} />,
  FarmIcon: <AgricultureIcon style={{ fontSize: '14px' }} />,
  MachineIcon: <PrecisionManufacturingIcon style={{ fontSize: '14px' }} />,
  BoatIcon: <DirectionsBoatIcon style={{ fontSize: '14px' }} />,
  GeneralIcon: <CategoryIcon style={{ fontSize: '14px', color: 'var(--color-ink-2)' }} />,
};

const TemperatureIcon = ({ className }) => (
  <img src={temperature} alt="temperature" className={className} />
);

const HumidityIcon = ({ className }) => <img src={Humidity} alt="humidity" className={className} />;

const SignalStrengthIcon = ({ className }) => (
  <img src={signal} alt="signal" className={className} />
);

const WaterLeakIcon = ({ className }) => (
  <img src={waterleak} alt="water leak" className={className} />
);

const BatteryIcon = ({ className }) => <img src={battery} alt="battery" className={className} />;

const TankLevelIcon = ({ className }) => (
  <img src={tankLevel} alt="tank level" className={className} />
);

const CurrentIcon = ({ className }) => <img src={current} alt="current" className={className} />;

const FingerprintIcon = ({ className }) => (
  <img src={fingerprint} alt="fingerprint" className={className} />
);

const FireAlarmIcon = ({ className }) => (
  <img src={fireAlarm} alt="fire alarm" className={className} />
);

const RouterIcon = ({ className }) => <img src={router} alt="router" className={className} />;

const SmokeDetectorIcon = ({ className }) => (
  <img src={smokeDetector} alt="smoke detector" className={className} />
);

const DoorIcon = ({ className }) => <img src={door} alt="door" className={className} />;

const GasLeakIcon = ({ className }) => <img src={gasleak} alt="gas leak" className={className} />;

const MotionIcon = ({ className }) => <img src={motion} alt="motion" className={className} />;

export const widgetsIconMapper = [
  {
    id: 'temperature',
    name: 'Temperature',
    icon: TemperatureIcon,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    id: 'humidity',
    name: 'Humidity',
    icon: HumidityIcon,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'signal',
    name: 'Signal Strength',
    icon: SignalStrengthIcon,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    id: 'waterLeak',
    name: 'Water Leak',
    icon: WaterLeakIcon,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    id: 'battery',
    name: 'Battery',
    icon: BatteryIcon,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    id: 'tankLevel',
    name: 'Tank Level',
    icon: TankLevelIcon,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    id: 'current',
    name: 'Current',
    icon: CurrentIcon,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    id: 'fingerprint',
    name: 'Fingerprint',
    icon: FingerprintIcon,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  {
    id: 'fireAlarm',
    name: 'Fire Alarm',
    icon: FireAlarmIcon,
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
  },
  {
    id: 'router',
    name: 'Router',
    icon: RouterIcon,
    color: 'text-ink-1',
    bgColor: 'bg-gray-500/10',
  },
  {
    id: 'smokeDetector',
    name: 'Smoke Detector',
    icon: SmokeDetectorIcon,
    color: 'text-slate-600',
    bgColor: 'bg-slate-500/10',
  },
  {
    id: 'door',
    name: 'Door',
    icon: DoorIcon,
    color: 'text-brown-600',
    bgColor: 'bg-brown-500/10',
  },
  {
    id: 'gasLeak',
    name: 'Gas Leak',
    icon: GasLeakIcon,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500/10',
  },
  {
    id: 'motion',
    name: 'Motion',
    icon: MotionIcon,
    color: 'text-teal-600',
    bgColor: 'bg-teal-500/10',
  },
];
