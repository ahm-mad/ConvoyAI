// dynamicImports.jsx
import React, { lazy, Suspense } from 'react';
import Loader from '@components/Loader';
import { useTranslation } from 'react-i18next';
import BatteryForm from '@forms/DashboardForms/BatteryForm';
import CurrentForm from '@forms/DashboardForms/CurrentForm';
import DeviceDefaultForm from '@forms/DashboardForms/DeviceDefaultForm';
import DoorStatusForm from '@forms/DashboardForms/DoorStatusForm';
import FingerPrintForm from '@forms/DashboardForms/FingerPrintForm';
import FireAlarmForm from '@forms/DashboardForms/FireAlarmForm';
import GasLeakForm from '@forms/DashboardForms/GasLeakForm';
import GatewayStatusForm from '@forms/DashboardForms/GatewayStatusForm';
import MixChartForm from '@forms/DashboardForms/MixChartForm';
import MotionSensorForm from '@forms/DashboardForms/MotionSensorForm';
import SignalStrengthForm from '@forms/DashboardForms/SignalStrengthForm';
import SmokeDetectorForm from '@forms/DashboardForms/SmokeDetectorForm';
import TankForm from '@forms/DashboardForms/TankForm';
import TemperatureForm from '@forms/DashboardForms/TemperatureForm';
import ValueForm from '@forms/DashboardForms/ValueForm';
import WaterLeakForm from '@forms/DashboardForms/WaterLeakForm';
import HumidityForm from '../forms/DashboardForms/HumidityForm';

const isDemo = JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;

// Helper function to create a lazy component with Suspense
const lazyWithSuspense = importFunc => {
  const LazyComponent = lazy(importFunc);
  return props => (
    <Suspense fallback={<div></div>}>
      <LazyComponent {...props} />
    </Suspense>
  );
};

// Widget Components - Dynamic Imports
export const Widgets = {
  // Real-time Data Widgets
  DeviceData: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/DeviceData')),
  TankLevel: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/TankLevel')),
  Value: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/Value')),
  TemperatureDevice: lazyWithSuspense(
    () => import('@components/Widgets/GeneralWidgets/TemperatureDevice')
  ),
  Battery: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/Battery')),
  SignalStrength: lazyWithSuspense(
    () => import('@components/Widgets/GeneralWidgets/SignalStrength')
  ),
  WaterLeak: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/WaterLeak')),
  MotionSensor: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/MotionSensor')),
  GatewayStatus: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/GatewayStatus')),
  SmokeDetector: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/SmokeDetector')),
  GasLeak: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/GasLeak')),
  FireAlarm: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/FireAlarm')),
  DoorStatus: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/DoorStatus')),
  Current: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/Current')),
  FingerPrint: lazyWithSuspense(() => import('@components/Widgets/GeneralWidgets/FingerPrint')),
  Humidity: lazyWithSuspense(() => import('../components/Widgets/GeneralWidgets/Humidity')),
  WidgetInitialDiv: lazyWithSuspense(
    () => import('@components/Widgets/GeneralWidgets/WidgetInitialDiv')
  ),

  // Visualization Widgets
  MixChart: lazyWithSuspense(() => import('@components/Widgets/GraphWidgets/MixChart')),
};

// Form Components - Dynamic Imports
export const Forms = {
  DeviceDefaultForm: DeviceDefaultForm,
  TankForm: TankForm,
  BatteryForm: BatteryForm,
  ValueForm: ValueForm,
  SignalStrengthForm: SignalStrengthForm,
  WaterLeakForm: WaterLeakForm,
  MotionSensorForm: MotionSensorForm,
  GatewayStatusForm: GatewayStatusForm,
  SmokeDetectorForm: SmokeDetectorForm,
  GasLeakForm: GasLeakForm,
  FireAlarmForm: FireAlarmForm,
  DoorStatusForm: DoorStatusForm,
  CurrentForm: CurrentForm,
  FingerPrintForm: FingerPrintForm,
  TemperatureForm: TemperatureForm,
  HumidityForm: HumidityForm,
  MixChartForm: MixChartForm,
};

// Maps widget types to their component and form classes
export const getWidgetConfig = () => {
  const { t } = useTranslation();

  return {
    battery: {
      title: t('widgets.battery'),
      component: Widgets.Battery,
      form: Forms.BatteryForm,
      w: 3,
      h: 3,
      minW: 3, // Minimum width
      minH: 3, // Minimum height
      // maxW: 6,  // Optional maximum
      category: 'realtime',
    },
    current: {
      title: 'Current',
      component: Widgets.Current,
      form: Forms.CurrentForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    ...(!isDemo && {
      DeviceDefault: {
        title: t('widgets.deviceDefault'),
        component: Widgets.DeviceData,
        form: Forms.DeviceDefaultForm,
        w: 4,
        h: 4,
        minW: 3,
        minH: 3,
        category: 'realtime',
      },
    }),
    doorStatus: {
      title: 'Door Status',
      component: Widgets.DoorStatus,
      form: Forms.DoorStatusForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    fingerPrint: {
      title: 'Fingerprint',
      component: Widgets.FingerPrint,
      form: Forms.FingerPrintForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    fireAlarm: {
      title: 'Fire Alarm',
      component: Widgets.FireAlarm,
      form: Forms.FireAlarmForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    gasLeak: {
      title: 'Gas Leak',
      component: Widgets.GasLeak,
      form: Forms.GasLeakForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    gatewayStatus: {
      title: 'Gateway Status',
      component: Widgets.GatewayStatus,
      form: Forms.GatewayStatusForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    humidity: {
      title: 'Humidity',
      component: Widgets.Humidity,
      form: Forms.HumidityForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    motionSensor: {
      title: 'Motion Sensor',
      component: Widgets.MotionSensor,
      form: Forms.MotionSensorForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    signalStrength: {
      title: t('widgets.signalStrength'),
      component: Widgets.SignalStrength,
      form: Forms.SignalStrengthForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    smokeDetector: {
      title: 'Smoke Detector',
      component: Widgets.SmokeDetector,
      form: Forms.SmokeDetectorForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    ...(!isDemo && {
      tankLevel: {
        title: t('widgets.tankLevel'),
        component: Widgets.TankLevel,
        form: Forms.TankForm,
        w: 3,
        h: 3,
        minW: 3,
        minH: 3,
        category: 'realtime',
      },
    }),
    temperatureDevice: {
      title: t('widgets.temperatureDevice'),
      component: Widgets.TemperatureDevice,
      form: Forms.TemperatureForm,
      w: 3,
      h: 2,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },
    // ...(!isDemo && {
    // value: {
    //   title: t('widgets.value'),
    //   component: Widgets.Value,
    //   form: Forms.ValueForm,
    //   w: 3,
    //   h: 3,
    //   minW: 4,
    //   minH: 4,
    //   category: 'realtime',
    // },
    // }),
    waterLeak: {
      title: t('widgets.waterLeak'),
      component: Widgets.WaterLeak,
      form: Forms.WaterLeakForm,
      w: 3,
      h: 3,
      minW: 3,
      minH: 3,
      category: 'realtime',
    },

    // ============ VISUALIZATION WIDGETS ============
    ...(!isDemo && {
      MixChart: {
        title: t('widgets.mixChart'),
        component: Widgets.MixChart,
        form: Forms.MixChartForm,
        w: 8,
        h: 5,
        minW: 6, // Charts ko bara minimum chahiye
        minH: 5,
        // maxW: 12, // Full width tak ja sakta hai
        category: 'visualization',
      },
    }),
  };
};
