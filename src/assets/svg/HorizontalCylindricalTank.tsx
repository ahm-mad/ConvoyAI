import React, { useState } from 'react';

const HorizontalCylindricalTank = ({ fillPercentage = 0, fillColor = 'orange' }) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });

  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const leftX = 16;
  const rightX = 85;
  const maxFillWidth = rightX - leftX;
  const fillWidth = (clamped / 100) * maxFillWidth;

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
          <clipPath id="horizontal-tank-clip">
            <path d="M85 50c0 13.7-3.6 24.9-8.1 24.9H24.1C19.6 74.9 16 63.7 16 50s3.6-24.9 8.1-24.9h52.8c4.5 0 8.1 11.2 8.1 24.9" />
          </clipPath>
        </defs>

        {/* Base tank shape */}
        <path
          d="M85 50c0 13.7-3.6 24.9-8.1 24.9H24.1C19.6 74.9 16 63.7 16 50s3.6-24.9 8.1-24.9h52.8c4.5 0 8.1 11.2 8.1 24.9"
          fill="#399ACD"
          opacity="0.1"
        />

        {/* Fill Overlay */}
        <rect
          x={leftX}
          y="25"
          width={fillWidth}
          height="50"
          fill={fillColor}
          opacity="0.6"
          clipPath="url(#horizontal-tank-clip)"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseMove}
          onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
        />

        {/* Tank outline and strokes (unchanged) */}
        <path
          d="M85 50c0 13.7-3.6 24.9-8.1 24.9H24.1C19.6 74.9 16 63.7 16 50s3.6-24.9 8.1-24.9h52.8c4.5 0 8.1 11.2 8.1 24.9z"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M76.9 74.9c-4.5 0-8.1-11.2-8.1-24.9s3.6-24.9 8.1-24.9"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M25 25.3c4 1.3 7.2 11.8 7.2 24.7 0 13.1-3.3 23.9-7.5 24.8"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
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

export default HorizontalCylindricalTank;
