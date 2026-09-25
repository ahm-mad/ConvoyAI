/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import LeftOverlayWebGL from '@components/LeftOverlayWebGLFarm';
import RightOverlayWebGL from '@components/RightOverlayWebGLFarm';
import { webGLDummyDataFarm } from '@root/src/utils/fakeBackend/Data';

const UnityControlFarm = () => {
  const unityContainer = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  function sendDatatoUnity(e: KeyboardEvent) {
    if (e.key === 'l' || e.key === 'L') {
      const data = JSON.stringify(webGLDummyDataFarm);
      if (window.gameInstance) {
        window.gameInstance.SendMessage('farmingManager', 'InitializeStaticData', data);
      }
    }
  }

  function handleFullScreen(e: KeyboardEvent) {
    if (e.key === 'f' || e.key === 'F') {
      const canvas = document.getElementById('unity-wrapper');
      if (canvas?.requestFullscreen) canvas.requestFullscreen();
    }
  }

  // const simulateLiveSensorUpdate = () => {
  //   webGLDummyData.floors[0].units[0].areas[0].sensors[0].Operations[0].warning = true;
  //   webGLDummyData.floors[5].units[1].areas[0].sensors[0].Operations[0].warning = true;
  //   webGLDummyData.floors[3].units[0].areas[0].sensors[0].Operations[0].warning = true;

  //   if (window.gameInstance) {
  //     window.gameInstance.SendMessage(
  //       'SpawningObjects',
  //       'UpdateRuntimeData',
  //       JSON.stringify(webGLDummyData)
  //     );
  //   }
  // };

  // setTimeout(simulateLiveSensorUpdate, 10000);

  // const handleChangeBackgroundColor = ()=>{
  //   if(window.gameInstance){
  //     window.gameInstance.SendMessage('Main Camera','SetBackgroundColor','#0f1d2a')
  //   }
  // }

  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/DiaryFarm/Build/Farming.loader.js';

    script.onload = () => {
      const canvas = document.getElementById('unity-canvas');
      const config = {
        dataUrl: '/DiaryFarm/Build/Farming.data.gz',
        frameworkUrl: '/DiaryFarm/Build/Farming.framework.js.gz',
        codeUrl: '/DiaryFarm/Build/Farming.wasm.gz',
      };

      if (window.createUnityInstance) {
        window
          .createUnityInstance(canvas, config, progressValue => {
            setProgress(Math.round(progressValue * 100));
          })
          .then(instance => {
            window.gameInstance = instance;
            setLoading(false);
          })
          .catch(err => {
            console.error('Unity failed to load:', err);
            setLoading(false);
          });
      }
    };

    document.body.appendChild(script);
    document.addEventListener('keydown', handleFullScreen);
    document.addEventListener('keydown', sendDatatoUnity);

    return () => {
      document.removeEventListener('keydown', handleFullScreen);
      document.removeEventListener('keydown', sendDatatoUnity);
    };
  }, []);

  const LoaderOverlay = () => (
    <div className="absolute inset-0 z-50 flex flex-col gap-2 items-center justify-center bg-surface-0 bg-opacity-90 backdrop-blur-md text-white text-xl font-semibold">
      Loading Hologram... {progress}%
      <div className="w-1/3 h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#29d3ff] transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );

  return (
    <div id="unity-wrapper" className="relative max-w-[95vw] h-[84vh] overflow-hidden">
      {loading && <LoaderOverlay />}
      <LeftOverlayWebGL />
      <RightOverlayWebGL />
      <canvas
        id="unity-canvas"
        ref={unityContainer}
        className="absolute top-0 left-0 w-full h-full z-0"
      ></canvas>
    </div>
  );
};

export default UnityControlFarm;
