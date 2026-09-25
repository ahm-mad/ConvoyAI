import React, { useState } from 'react';

const RectangularTank = ({ fillPercentage = 0, fillColor = 'orange' }) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });

  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const topY = 25;
  const bottomY = 74.9;
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
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="rectangular-tank-clip">
            <path d="M78.9 67.5V25H36.4L22 32.4v42.5h42.5z" />
          </clipPath>
        </defs>

        {/* Background */}
        <path d="M78.9 67.5V25H36.4L22 32.4v42.5h42.5z" fill="#399ACD" opacity="0.1" />

        {/* Fill Overlay */}
        <rect
          x="22"
          y={fillY}
          width="56.9"
          height={fillHeight}
          fill={fillColor}
          opacity="0.6"
          clipPath="url(#rectangular-tank-clip)"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseMove}
          onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
        />

        {/* Original Outline */}
        <path
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          d="M78.9 67.5V25H36.4L22 32.4v42.5h42.5z"
        />
        <path
          d="M36.4 67.5V25"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
        />
        <path
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          d="M78.9 25l-14.4 7.4v42.5M22 32.4h42.5"
        />
        <path
          d="M22 74.9l14.4-7.4M78.9 67.5H36.4"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
        />
      </svg>

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

export default RectangularTank;
