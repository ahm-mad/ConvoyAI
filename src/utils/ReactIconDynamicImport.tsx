import React, { useEffect, useState } from 'react';

export const iconMap = {
  acceleration: () => import('@assets/icons/ReactIcon/AccelerationIcon'),
  accelerometer: () => import('@assets/icons/ReactIcon/AccelerometerIcon'),
  accurrent: () => import('@assets/icons/ReactIcon/ACCurrentIcon'),
  // adjustments: () => import('@assets/icons/ReactIcon/AdjustmentsIcon'),
  air: () => import('@assets/icons/ReactIcon/AirIcon'),
  app: () => import('@assets/icons/ReactIcon/AppIcon'),
  barchart: () => import('@assets/icons/ReactIcon/BarChartIcon'),
  basestation: () => import('@assets/icons/ReactIcon/BaseStationIcon'),
  battery: () => import('@assets/icons/ReactIcon/BatteryIcon'),
  beacon: () => import('@assets/icons/ReactIcon/BeaconIcon'),
  bed: () => import('@assets/icons/ReactIcon/BedIcon'),
  bell: () => import('@assets/icons/ReactIcon/BellIcon'),
  bluetooth: () => import('@assets/icons/ReactIcon/BluetoothIcon'),
  bolt: () => import('@assets/icons/ReactIcon/BoltIcon'),
  bug: () => import('@assets/icons/ReactIcon/BugIcon'),
  building: () => import('@assets/icons/ReactIcon/BuildingIcon'),
  calender: () => import('@assets/icons/ReactIcon/CalenderIcon'),
  callend: () => import('@assets/icons/ReactIcon/CallEndIcon'),
  camera: () => import('@assets/icons/ReactIcon/CameraIcon'),
  car: () => import('@assets/icons/ReactIcon/CarIcon'),
  chat: () => import('@assets/icons/ReactIcon/ChatIcon'),
  check: () => import('@assets/icons/ReactIcon/CheckIcon'),
  // chevron_up: () => import('@assets/icons/ReactIcon/ChevronUp'),
  // circle_chevron_down: () => import('@assets/icons/ReactIcon/CircleChevronDown'),
  // circle_chevron_up: () => import('@assets/icons/ReactIcon/CircleChevronUp'),
  clock: () => import('@assets/icons/ReactIcon/ClockIcon'),
  close: () => import('@assets/icons/ReactIcon/CloesIcon'),
  co2: () => import('@assets/icons/ReactIcon/CO2Icon'),
  code: () => import('@assets/icons/ReactIcon/CodeIcon'),
  coffeemaker: () => import('@assets/icons/ReactIcon/CoffeeMakerIcon'),
  cog: () => import('@assets/icons/ReactIcon/CogIcon'),
  cold: () => import('@assets/icons/ReactIcon/ColdIcon'),
  container: () => import('@assets/icons/ReactIcon/ContainerIcon'),
  cube: () => import('@assets/icons/ReactIcon/CubeIcon'),
  dashboard: () => import('@assets/icons/ReactIcon/Dashboard'),
  device: () => import('@assets/icons/ReactIcon/DeviceIcon'),
  dewpointalt: () => import('@assets/icons/ReactIcon/DewPointAltIcon'),
  document: () => import('@assets/icons/ReactIcon/DocumentIcon'),
  donutchart: () => import('@assets/icons/ReactIcon/DonutChartIcon'),
  download: () => import('@assets/icons/ReactIcon/DownloadIcon'),
  emergency: () => import('@assets/icons/ReactIcon/EmergencyIcon'),
  emoji: () => import('@assets/icons/ReactIcon/EmojiIcon'),
  enter: () => import('@assets/icons/ReactIcon/EnterIcon'),
  error: () => import('@assets/icons/ReactIcon/ErrorIcon'),
  exit: () => import('@assets/icons/ReactIcon/ExitIcon'),
  fan: () => import('@assets/icons/ReactIcon/FanIcon'),
  fire: () => import('@assets/icons/ReactIcon/FireIcon'),
  forklift: () => import('@assets/icons/ReactIcon/ForkLiftIcon'),
  frequency: () => import('@assets/icons/ReactIcon/FrequencyIcon'),
  gallery: () => import('@assets/icons/ReactIcon/GalleryIcon'),
  gauge: () => import('@assets/icons/ReactIcon/GaugeIcon'),
  gravity: () => import('@assets/icons/ReactIcon/GravityIcon'),
  grid: () => import('@assets/icons/ReactIcon/GridIcon'),
  // hand: () => import('@assets/icons/ReactIcon/handIcon'),
  // heart: () => import('@assets/icons/ReactIcon/HeartIcon'),
  hourglass: () => import('@assets/icons/ReactIcon/HourGlassIcon'),
  house: () => import('@assets/icons/ReactIcon/HouseIcon'),
  hub: () => import('@assets/icons/ReactIcon/HubIcon'),
  humidity: () => import('@assets/icons/ReactIcon/HumidityIcon'),
  leak: () => import('@assets/icons/ReactIcon/LeakIcon'),
  level: () => import('@assets/icons/ReactIcon/LevelIcon'),
  linechart: () => import('@assets/icons/ReactIcon/LineChartIcon'),
  luminosity: () => import('@assets/icons/ReactIcon/LuminosityIcon'),
  memory: () => import('@assets/icons/ReactIcon/MemoryIcon'),
  motion: () => import('@assets/icons/ReactIcon/MotionIcon'),
  profile: () => import('@assets/icons/ReactIcon/ProfileIcon'),
  // speed: () => import('@assets/icons/ReactIcon/SpeedIcon'),
  temperature: () => import('@assets/icons/ReactIcon/TemperatureIcon'),
  threedot: () => import('@assets/icons/ReactIcon/ThreeDotIcon'),
  toggle: () => import('@assets/icons/ReactIcon/ToggleIcon'),
  voltage: () => import('@assets/icons/ReactIcon/VoltageIcon'),
};

const IconWrapper = ({ name, className = 'h-6 w-6' }) => {
  const [IconComponent, setIconComponent] = useState(null);

  useEffect(() => {
    let mounted = true;

    iconMap[name]?.().then(mod => {
      if (mounted) {
        setIconComponent(() => mod.default);
      }
    });

    return () => {
      mounted = false;
    };
  }, [name]);

  if (!IconComponent) return null;

  return <IconComponent className={className} />;
};

export default IconWrapper;
