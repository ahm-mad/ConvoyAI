import React, { useEffect, useState } from 'react';

const RotateDeviceOverlay = () => {
  const [isLandscape, setIsLandscape] = useState(true);

  const handleOrientation = () => {
    const isLandscapeNow = window.matchMedia('(orientation: landscape)').matches;
    setIsLandscape(isLandscapeNow);
  };

  useEffect(() => {
    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  const isSmallScreen = window.innerWidth <= 770;

  if (!isSmallScreen || isLandscape) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black flex items-center justify-center overflow-hidden">
      {/* Static gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-sky-600/20 to-cyan-600/20"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#29d3ff]/20 rounded-full mix-blend-multiply filter blur-3xl"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-sky-500/30 rounded-full mix-blend-multiply filter blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-cyan-500/30 rounded-full mix-blend-multiply filter blur-3xl"></div>
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:64px_64px]"></div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-md">
        {/* Phone illustration with rotation */}
        <div className="relative mb-12 flex items-center justify-center">
          <div className="absolute w-32 h-32 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full blur-2xl opacity-40"></div>

          {/* Portrait phone that rotates */}
          <div className="relative transform animate-[tilt_3s_ease-in-out_infinite]">
            <div className="w-24 h-40 bg-gradient-to-b from-slate-800 to-slate-900 rounded-[1.5rem] border-4 border-slate-700 shadow-2xl relative overflow-hidden">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-600 rounded-full"></div>
              <div className="absolute inset-3 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-xl"></div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 border-2 border-slate-600 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-4">
          <h1 className=" text-xl md:text-2xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent">
              Rotate Device
            </span>
          </h1>
          <p className="text-slate-400 text- font-medium">Turn your phone to landscape mode</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes tilt {
          0%,
          100% {
            transform: rotate(-10deg);
          }
          50% {
            transform: rotate(90deg);
          }
        }
      `}</style>
    </div>
  );
};

export default RotateDeviceOverlay;
