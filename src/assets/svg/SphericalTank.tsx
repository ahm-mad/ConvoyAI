import React, { useState } from 'react';

const SphericalTank = ({ fillPercentage = 0, fillColor = 'orange' }) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });

  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const topY = 25;
  const bottomY = 76;
  const maxFillHeight = bottomY - topY;
  const fillHeight = (clamped / 100) * maxFillHeight;
  const fillY = bottomY - fillHeight;

  const handleMouseMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="w-full h-full relative">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <defs>
          <clipPath id="spherical-tank-clip">
            <path d="M74.9 50A25 25 0 1125 50a25 25 0 0149.9 0z" />
          </clipPath>
        </defs>

        {/* Base Tank Shape */}
        <path d="M74.9 50A25 25 0 1125 50a25 25 0 0149.9 0z" fill="#399ACD" opacity="0.1" />

        {/* Fill Overlay */}
        <rect
          x="25"
          y={fillY}
          width="50"
          height={fillHeight}
          fill={fillColor}
          opacity="0.6"
          clipPath="url(#spherical-tank-clip)"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseMove}
          onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
        />

        {/* Outline and internal lines */}
        <path
          d="M74.9 50A25 25 0 1125 50a25 25 0 0149.9 0z"
          stroke="#1263AD"
          fill="none"
          strokeWidth="1"
        />
        <path
          d="M74.9 50c0-4.6-11.2-8.2-25-8.2-13.7 0-24.9 3.6-24.9 8.1"
          stroke="#1263AD"
          fill="none"
          strokeWidth="1"
          strokeDasharray="1,1"
          opacity="0.5"
        />
        <path
          d="M74.9 50c0 4.4-11.2 8-25 8C36.2 58 25 54.5 25 50"
          stroke="#1263AD"
          fill="none"
          strokeWidth="1"
        />
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute px-2 py-1 text-xs text-white bg-black rounded shadow pointer-events-none"
          style={{
            top: tooltip.y,
            left: tooltip.x,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {`Fill: ${clamped.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
};

export default SphericalTank;
