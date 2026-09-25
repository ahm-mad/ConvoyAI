import React, { useEffect, useRef } from 'react';
// import Lottie from 'lottie-react';
import lottieLight from 'lottie-web/build/player/lottie_light';
import Humidity from '@components/Widgets/DeviceWidgets/Humidity';

export const lottieMap = {
  abnormal_pipe2: () => import('@assets/LottieFiles/abnormal_pipe2.json'), //done
  authorized: () => import('@assets/LottieFiles/authorized.json'), //done
  battery: () => import('@assets/LottieFiles/Battery.json'), //done
  current: () => import('@assets/LottieFiles/current.json'), //done
  door_opening: () => import('@assets/LottieFiles/door_opening.json'), //done
  fingerprint: () => import('@assets/LottieFiles/fingerprint.json'), //done
  fingerprintIdle: () => import('@assets/LottieFiles/FingerprintIdle.json'), //done
  firealarm: () => import('@assets/LottieFiles/firealarm.json'), //done
  gas_leakage: () => import('@assets/LottieFiles/gas_leakage.json'), //done
  gateway2: () => import('@assets/LottieFiles/gateway2.json'), //done
  gps: () => import('@assets/LottieFiles/gps.json'), //pending
  motion_sensor: () => import('@assets/LottieFiles/motion_sensor.json'), //done
  signal: () => import('../assets/LottieFiles/Signal.json'), //done
  smoke_detector: () => import('@assets/LottieFiles/smoke_detector.json'), //done
  sound: () => import('@assets/LottieFiles/sound.json'),
  temperature: () => import('@assets/LottieFiles/temperature.json'), //done
  temperature_black: () => import('@assets/LottieFiles/temperature_black.json'), //done
  temperature_blue: () => import('@assets/LottieFiles/Temperature_Blue.json'), //done
  voltage: () => import('@assets/LottieFiles/voltage.json'), //done
  water_tank: () => import('@assets/LottieFiles/water_tank.json'), //done
  Humidity: () => import('@assets/LottieFiles/Humidity.json'),
};

const LottieWrapper = ({ name, className = '', loop = true, autoplay = true }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    let animationInstance = null;

    lottieMap[name]?.().then(data => {
      if (containerRef.current) {
        animationInstance = lottieLight.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay,
          animationData: data.default,
        });
      }
    });

    return () => {
      if (animationInstance) animationInstance.destroy();
    };
  }, [name, loop, autoplay]);

  return <div ref={containerRef} className={className} />;
};

export default LottieWrapper;
