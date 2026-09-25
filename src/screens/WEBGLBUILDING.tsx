/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import LeftOverlayWebGL from '@components/LeftOverlayWebGLBuilding';
import RightOverlayWebGL from '@components/RightOverlayWebGLBuilding';
import Breadcrumb from '@components/webglBreadcrumb';
import { getBreadcrumb } from '@utils/DataFormatter';
import { ArrowLeft } from 'lucide-react';
import Loader from '@components/Loader';
import LandscapeOnly from '@components/RotateDeviceOverlay';

interface UnityControlBuildingProps {
  webglBuildingData?: any;
}

const UnityControlBuilding = ({ webglBuildingData }: UnityControlBuildingProps) => {
  const unityContainer = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [transitionState, setTransitionState] = useState('False');
  const [breadCrumb, setBreadCrumb] = useState<any[]>([{ id: '', name: '', isAsset: true }]);
  const refCount = useRef(0);
  const [dataFromUnity, setDataFromUnity] = useState<any>({
    clickedNodeId: webglBuildingData?.assetId || '',
    currentView: 'parent',
  });

  console.log('BHAI-unity-info', dataFromUnity);

  // 1. Load Unity once
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/unity/Build/ConvoyAI.loader.js';

    script.onload = () => {
      const canvas = document.getElementById('unity-canvas');
      const config = {
        dataUrl: '/unity/Build/ConvoyAI.data.gz',
        frameworkUrl: '/unity/Build/ConvoyAI.framework.js.gz',
        codeUrl: '/unity/Build/ConvoyAI.wasm.gz',
      };

      if (window.createUnityInstance) {
        window
          .createUnityInstance(canvas, config, progressValue => {
            setProgress(Math.round(progressValue * 100));
          })
          .then(instance => {
            window.gameInstance = instance;
            window.unityInitialized = false;
            setLoading(false);
          })
          .catch(err => {
            console.error('Unity failed to load:', err);
            setLoading(false);
          });
      }
    };

    document.body.appendChild(script);
  }, []);

  // 2. Bridge for Unity -> React
  useEffect(() => {
    if (!webglBuildingData?.assetId) return;
    setDataFromUnity((prev: any) => ({ ...prev, clickedNodeId: webglBuildingData?.assetId }));
    setBreadCrumb([
      { id: webglBuildingData?.assetId, name: webglBuildingData?.assetName, isAsset: true },
    ]);

    window.ReactUnityBridge = (type: any, payload: any) => {
      console.log('BHAI data from unity', 'type:- ', type, 'payload:- ', payload);

      const currentState: { view: string; id: any } = { view: '', id: '' };

      if (type == 'viewState' && payload == 'BuildingView') {
        setDataFromUnity((prev: any) => ({
          ...prev,
          currentView: 'parent',
          clickedNodeId: webglBuildingData?.assetId,
        }));
        currentState.view = 'building';
        currentState.id = webglBuildingData?.assetId;
        setBreadCrumb(
          getBreadcrumb(
            webglBuildingData?.transformedData,
            currentState,
            webglBuildingData?.assetName
          )
        );
      } else if (type == 'floorId' || type == 'unitId' || type == 'areaId') {
        setDataFromUnity((prev: any) => ({
          ...prev,
          currentView: 'child',
          clickedNodeId: payload,
        }));
        switch (type) {
          case 'floorId':
            currentState.view = 'floor';
            currentState.id = payload;
            break;
          case 'unitId':
            currentState.view = 'unit';
            currentState.id = payload;
            break;
          case 'areaId':
            currentState.view = 'area';
            currentState.id = payload;
            break;
          default:
            console.log('Default');
            break;
        }
        setBreadCrumb(getBreadcrumb(webglBuildingData?.transformedData, currentState));
      } else if (type == 'TRANSITION STATE') {
        setTransitionState(payload);
      }
    };
  }, [webglBuildingData?.assetId]);

  // 3. Send data automatically when Unity is ready + data is available
  useEffect(() => {
    if (!loading && !!window?.gameInstance && !!webglBuildingData?.transformedData?.floors) {
      // setDataFromUnity(prev => ({ ...prev, clickedNodeId: webglBuildingData?.assetId }));
      // setBreadCrumb([
      //   { id: webglBuildingData?.assetId, name: webglBuildingData?.assetName, isAsset: true },
      // ]);

      // const data = JSON.stringify(webGLDummyData);
      const data = JSON.stringify(webglBuildingData?.transformedData);
      console.log('Sending data to Unity:', data);

      if (!window.unityInitialized) {
        window.gameInstance.SendMessage('SpawningObjects', 'InitializeStaticData', data);
        window.unityInitialized = true;
      } else {
        window.gameInstance.SendMessage('SpawningObjects', 'UpdateRuntimeData', data);
      }
      // refCount.current += 1;
    }
  }, [loading, webglBuildingData?.transformedData, window?.gameInstance]);

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
    <div id="unity-wrapper" className="relative max-w-[95vw] h-[84vh] overflow-hidden flex">
      <LandscapeOnly />
      <LeftOverlayWebGL webglBuildingData={webglBuildingData} dataFromUnity={dataFromUnity} />

      {/* Back Button - Left Side */}

      {/* Futuristic Header with Breadcrumb */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-[60%] z-10">
        <div className="absolute -top-1 left-1/2 w-[80%] -translate-x-1/2 ">
          <svg
            viewBox="0 0 641 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-auto"
          >
            <path
              d="M0 0C11.7267 0.516226 23.4535 1.03079 35.1803 1.54368C78.5377 3.44 121.896 5.31355 165.255 7.16434C167.902 7.24674 170.381 9.08353 171.23 11.5865C175.801 24.5512 180.374 37.5153 184.949 50.4785C185.932 53.3823 188.877 55.4693 191.947 55.4334C208.965 55.451 225.982 55.4651 243 55.4758C268.833 55.4919 294.666 55.5 320.499 55.5C363.017 55.5 405.535 55.4781 448.053 55.4344C451.123 55.4704 454.069 53.3831 455.052 50.4789C459.627 37.5161 464.2 24.5525 468.771 11.5881C469.62 9.08519 472.099 7.24865 474.746 7.16693C518.438 5.31281 562.129 3.43557 605.819 1.53522C617.546 1.02515 629.273 0.513407 641 0C629.27 0.446796 617.541 0.895258 605.812 1.34538C562.112 3.02238 518.414 4.72249 474.716 6.44572C471.782 6.52749 469.021 8.55661 468.067 11.339C463.46 24.2902 458.854 37.2422 454.251 50.195C453.374 52.7645 450.764 54.6034 448.053 54.5656C405.535 54.5219 363.017 54.5 320.499 54.5C294.666 54.5 268.833 54.5081 243 54.5242C225.982 54.5349 208.965 54.549 191.947 54.5666C189.236 54.6044 186.625 52.7653 185.748 50.1953C181.145 37.2422 176.539 24.2899 171.931 11.3383C170.978 8.55706 168.219 6.52857 165.285 6.44613C121.92 4.72594 78.5546 3.02851 35.1881 1.35384C23.4588 0.900896 11.7294 0.449615 0 0Z"
              fill="#29d3ff"
            />
            <path
              d="M0 0C11.7267 0.516226 23.4535 1.03079 35.1803 1.54368C78.5377 3.44 121.896 5.31355 165.255 7.16434C167.902 7.24674 170.381 9.08353 171.23 11.5865C175.801 24.5512 180.374 37.5153 184.949 50.4785C185.932 53.3823 188.877 55.4693 191.947 55.4334C208.965 55.451 225.982 55.4651 243 55.4758C268.833 55.4919 294.666 55.5 320.499 55.5C363.017 55.5 405.535 55.4781 448.053 55.4344C451.123 55.4704 454.069 53.3831 455.052 50.4789C459.627 37.5161 464.2 24.5525 468.771 11.5881C469.62 9.08519 472.099 7.24865 474.746 7.16693C518.438 5.31281 562.129 3.43557 605.819 1.53522C617.546 1.02515 629.273 0.513407 641 0C629.27 0.446796 617.541 0.895258 605.812 1.34538C562.112 3.02238 518.414 4.72249 474.716 6.44572C471.782 6.52749 469.021 8.55661 468.067 11.339C463.46 24.2902 458.854 37.2422 454.251 50.195C453.374 52.7645 450.764 54.6034 448.053 54.5656C405.535 54.5219 363.017 54.5 320.499 54.5C294.666 54.5 268.833 54.5081 243 54.5242C225.982 54.5349 208.965 54.549 191.947 54.5666C189.236 54.6044 186.625 52.7653 185.748 50.1953C181.145 37.2422 176.539 24.2899 171.931 11.3383C170.978 8.55706 168.219 6.52857 165.285 6.44613C121.92 4.72594 78.5546 3.02851 35.1881 1.35384C23.4588 0.900896 11.7294 0.449615 0 0Z"
              fill="black"
              fillOpacity="0.2"
            />
          </svg>
        </div>
        <div>
          <div className="absolute left-1/2 w-[80%] -translate-x-1/2 ">
            <svg
              viewBox="0 0 641 60"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-auto"
            >
              <path
                d="M0 0C11.6648 0.811455 23.3299 1.61792 34.9954 2.41939C76.5194 5.2723 118.047 8.06198 159.579 10.7884C161.795 10.9142 163.854 12.4001 164.671 14.4489C170.121 27.6946 175.578 40.9374 181.041 54.1772C182.251 57.2011 185.398 59.3156 188.667 59.2881C206.778 59.3463 224.889 59.3926 243 59.4268C268.833 59.4756 294.666 59.5 320.499 59.5C364.11 59.5 407.722 59.4304 451.333 59.2913C454.603 59.3189 457.751 57.2036 458.962 54.1786C464.426 40.9393 469.882 27.6973 475.332 14.4523C476.149 12.4043 478.207 10.9193 480.423 10.7946C522.287 8.06279 564.147 5.26677 606.004 2.40651C617.669 1.60933 629.335 0.807162 641 0C629.323 0.607528 617.646 1.22004 605.969 1.83755C564.074 4.05316 522.182 6.33302 480.294 8.67713C477.287 8.81787 474.456 10.8102 473.309 13.6092C467.742 26.8052 462.181 40.0042 456.628 53.2061C455.773 55.2995 453.583 56.7433 451.333 56.7087C407.722 56.5696 364.11 56.5 320.499 56.5C294.666 56.5 268.833 56.5244 243 56.5732C224.889 56.6074 206.778 56.6537 188.667 56.7119C186.416 56.7466 184.224 55.3021 183.369 53.2074C177.815 40.0051 172.254 26.8057 166.686 13.6092C165.54 10.8128 162.713 8.82194 159.708 8.68028C118.152 6.34043 76.5931 4.06382 35.0301 1.85045C23.3537 1.22864 11.677 0.611826 0 0Z"
                fill="#29d3ff"
              />
              <path
                d="M0 0C11.6648 0.811455 23.3299 1.61792 34.9954 2.41939C76.5194 5.2723 118.047 8.06198 159.579 10.7884C161.795 10.9142 163.854 12.4001 164.671 14.4489C170.121 27.6946 175.578 40.9374 181.041 54.1772C182.251 57.2011 185.398 59.3156 188.667 59.2881C206.778 59.3463 224.889 59.3926 243 59.4268C268.833 59.4756 294.666 59.5 320.499 59.5C364.11 59.5 407.722 59.4304 451.333 59.2913C454.603 59.3189 457.751 57.2036 458.962 54.1786C464.426 40.9393 469.882 27.6973 475.332 14.4523C476.149 12.4043 478.207 10.9193 480.423 10.7946C522.287 8.06279 564.147 5.26677 606.004 2.40651C617.669 1.60933 629.335 0.807162 641 0C629.323 0.607528 617.646 1.22004 605.969 1.83755C564.074 4.05316 522.182 6.33302 480.294 8.67713C477.287 8.81787 474.456 10.8102 473.309 13.6092C467.742 26.8052 462.181 40.0042 456.628 53.2061C455.773 55.2995 453.583 56.7433 451.333 56.7087C407.722 56.5696 364.11 56.5 320.499 56.5C294.666 56.5 268.833 56.5244 243 56.5732C224.889 56.6074 206.778 56.6537 188.667 56.7119C186.416 56.7466 184.224 55.3021 183.369 53.2074C177.815 40.0051 172.254 26.8057 166.686 13.6092C165.54 10.8128 162.713 8.82194 159.708 8.68028C118.152 6.34043 76.5931 4.06382 35.0301 1.85045C23.3537 1.22864 11.677 0.611826 0 0Z"
                fill="black"
                fillOpacity="0.2"
              />
            </svg>
          </div>

          {!breadCrumb?.[0]?.isAsset && (
            <div className="absolute top-4 cursor-pinter  sm:left-20 left-16 lg:left-12 z-10">
              <button
                onClick={() => window.gameInstance.SendMessage('SpawningObjects', 'GoBack')}
                className="flex items-center cursor-pinter justify-center w-10 h-10 rounded-full bg-[#29d3ff]/15 hover:bg-[#29d3ff]/25 transition-colors duration-200 border border-[#29d3ff]/40"
                aria-label="Go back"
                disabled={transitionState == 'True'}
              >
                {transitionState == 'True' ? (
                  <Loader sx={{ color: '#29d3ff' }} />
                ) : (
                  <ArrowLeft className="w-6 h-6 text-[#29d3ff]" />
                )}
              </button>
            </div>
          )}

          {/* Breadcrumb Content */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center justify-center">
            <div className="text-white text-wrap font-bold text-lg tracking-wider">
              <Breadcrumb items={breadCrumb} />
            </div>
          </div>
        </div>
      </div>
      {loading && <LoaderOverlay />}
      <canvas
        id="unity-canvas"
        ref={unityContainer}
        tabIndex={-1}
        className="absolute top-0 left-0 w-full h-full z-0"
      ></canvas>

      <RightOverlayWebGL />
    </div>
  );
};

export default UnityControlBuilding;
